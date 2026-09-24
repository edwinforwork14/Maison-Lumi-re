/**
 * Comercio del storefront sobre PostgreSQL (Fase 3 del Plan 03).
 *
 * Sustituye el camino en memoria que **no descontaba stock**. Aquí:
 * 1. La cotización se lee de la base: precio, existencias reales, métodos de
 *    envío y umbral de envío gratuito salen de las tablas, no de constantes.
 * 2. El pedido se crea en una transacción que **reserva** el stock (evita
 *    sobreventa) y, con el pago simulado, se **compromete**: `on_hand` baja y
 *    queda el movimiento en el ledger.
 * 3. La lectura de pedidos filtra por el email del titular **en SQL**, de modo
 *    que la propiedad no depende de que la UI se acuerde de comprobarla.
 *
 * Cuando exista una pasarela real, el compromiso (`commit`) pasa al webhook y
 * aquí sólo se reserva.
 */

import { and, asc, desc, eq, ilike, inArray, sql } from 'drizzle-orm'
import {
  add,
  money,
  multiply,
  sum,
  type Money,
} from '../../domain/money/money.ts'
import {
  amountToFreeShipping,
  isFreeShipping,
  shippingCostFor,
  type ShippingMethod,
  type ShippingMethodId,
} from '../../domain/pricing/rules.ts'
import { getDb, type Database } from '../db/client.ts'
import { inventoryItems } from '../db/schema/inventory.ts'
import { orderItems, orders as ordersTable } from '../db/schema/orders.ts'
import { productMedia, productVariants, products } from '../db/schema/catalog.ts'
import { shippingMethods as shippingMethodsTable } from '../db/schema/shipping.ts'
import { siteSettings } from '../db/schema/content.ts'
import { placeOrderTransactional } from '../db/repositories/orders.postgres.ts'
import { AppError } from '../errors.ts'
import type { CartQuote, QuoteLine, ShippingOptionQuote } from './commerce.ts'

export interface StorefrontLine {
  readonly productId: string
  readonly color: string
  readonly quantity: number
}

const MAX_QUANTITY_PER_LINE = 99
const DEFAULT_FREE_SHIPPING_THRESHOLD_CENTS = 50_000

/**
 * TTL de la reserva de un pedido de la tienda: la confirmación por WhatsApp
 * puede tardar, así que se bloquea el stock 48 h en lugar de 15 minutos.
 */
const STOREFRONT_RESERVATION_TTL_SECONDS = 60 * 60 * 48

/** Métodos de envío y umbral de gratuidad tal como están configurados. */
export async function readShippingConfig(db: Database = getDb()): Promise<{
  methods: ShippingMethod[]
  freeThresholdCents: number
}> {
  const rows = await db
    .select()
    .from(shippingMethodsTable)
    .orderBy(asc(shippingMethodsTable.priceCents))

  const methods: ShippingMethod[] = rows.map((row) => ({
    id: row.code as ShippingMethodId,
    name: row.name,
    description: `${row.etaMinDays} – ${row.etaMaxDays} días`,
    price: money(row.priceCents),
  }))

  const [setting] = await db
    .select({ value: siteSettings.value })
    .from(siteSettings)
    .where(eq(siteSettings.key, 'shipping.free_threshold_cents'))
    .limit(1)
  const threshold = Number(setting?.value ?? DEFAULT_FREE_SHIPPING_THRESHOLD_CENTS)

  return {
    methods,
    freeThresholdCents: Number.isFinite(threshold)
      ? threshold
      : DEFAULT_FREE_SHIPPING_THRESHOLD_CENTS,
  }
}

function availabilityOf(stock: number): QuoteLine['availability'] {
  if (stock === 0) return 'out_of_stock'
  return stock <= 3 ? 'low' : 'in_stock'
}

/**
 * Cotización autoritativa leída de la base. Devuelve la misma forma que la
 * cotización en memoria, así que la UI no cambia.
 */
export async function quoteCartFromDb(
  input: { lines: readonly StorefrontLine[]; shippingMethod?: ShippingMethodId },
  db: Database = getDb(),
): Promise<CartQuote> {
  const productIds = [...new Set(input.lines.map((line) => line.productId))]
  const requested = input.lines.filter((line) => line.quantity > 0)

  const variantRows =
    productIds.length === 0
      ? []
      : await db
          .select({
            productId: products.id,
            slug: products.slug,
            name: products.name,
            variantId: productVariants.id,
            sku: productVariants.sku,
            color: productVariants.color,
            priceCents: productVariants.priceCents,
            status: productVariants.status,
            productStatus: products.status,
            onHand: inventoryItems.onHand,
            reserved: inventoryItems.reserved,
          })
          .from(productVariants)
          .innerJoin(products, eq(products.id, productVariants.productId))
          .leftJoin(inventoryItems, eq(inventoryItems.variantId, productVariants.id))
          .where(inArray(productVariants.productId, productIds))

  // Sólo se vende lo publicado: un borrador del panel no debe poder comprarse.
  const sellable = variantRows.filter(
    (row) => row.productStatus === 'active' && row.status === 'active',
  )

  const mediaRows =
    productIds.length === 0
      ? []
      : await db
          .select({
            productId: productMedia.productId,
            storageKey: productMedia.storageKey,
          })
          .from(productMedia)
          .where(inArray(productMedia.productId, productIds))
          .orderBy(asc(productMedia.position))
  const imageByProduct = new Map<string, string>()
  for (const row of mediaRows) {
    if (!imageByProduct.has(row.productId)) {
      imageByProduct.set(row.productId, row.storageKey)
    }
  }

  const lines: QuoteLine[] = []
  for (const item of requested) {
    const variant = sellable.find(
      (row) => row.productId === item.productId && row.color === item.color,
    )
    if (!variant) continue // producto retirado o color inexistente: la línea cae
    const availableStock = Math.max(0, (variant.onHand ?? 0) - (variant.reserved ?? 0))
    const quantity = Math.max(
      0,
      Math.min(Math.trunc(item.quantity), MAX_QUANTITY_PER_LINE),
    )
    const unitPrice = money(variant.priceCents)
    lines.push({
      productId: variant.productId,
      variantId: variant.variantId,
      slug: variant.slug,
      sku: variant.sku,
      name: variant.name,
      color: variant.color,
      image: imageByProduct.get(variant.productId) ?? '',
      unitPrice,
      quantity,
      lineTotal: multiply(unitPrice, quantity),
      availableStock,
      availability: availabilityOf(availableStock),
    })
  }

  const subtotal = sum(lines.map((line) => line.lineTotal))
  const { methods } = await readShippingConfig(db)

  const shippingOptions: ShippingOptionQuote[] = methods.map((method) => ({
    id: method.id,
    label: method.name,
    description: method.description,
    price: shippingCostFor(methods, method.id, subtotal),
    free: isFreeShipping(subtotal),
  }))

  const method = input.shippingMethod ?? 'standard'
  const shipping =
    shippingOptions.find((option) => option.id === method)?.price ??
    money(0, subtotal.currency)

  return {
    lines,
    subtotal,
    shipping,
    total: add(subtotal, shipping),
    freeShippingRemaining: amountToFreeShipping(subtotal),
    shippingOptions,
  }
}

/** `orders.shipping_method_id` referencia la tabla: hay que resolver el uuid. */
async function resolveShippingMethodId(
  code: ShippingMethodId | undefined,
  db: Database,
): Promise<string | undefined> {
  if (!code) return undefined
  const [row] = await db
    .select({ id: shippingMethodsTable.id })
    .from(shippingMethodsTable)
    .where(eq(shippingMethodsTable.code, code))
    .limit(1)
  return row?.id
}

export interface PlaceStorefrontOrderInput {
  readonly email: string
  readonly userId?: string
  readonly lines: readonly StorefrontLine[]
  readonly shippingMethod?: ShippingMethodId
  readonly customer: {
    readonly firstName: string
    readonly lastName: string
    readonly email: string
    readonly address: string
    readonly city: string
    readonly postalCode: string
    readonly country: string
  }
  readonly idempotencyKey: string
}

export interface PlacedStorefrontOrder {
  readonly orderNumber: string
  readonly total: Money
  readonly status: string
  /** Reservas creadas: bloquean el stock para que no se venda dos veces. */
  readonly reservationIds: readonly string[]
  /** Hasta cuándo está bloqueado el stock si la tienda no confirma. */
  readonly reservedUntil: string
}

/**
 * Crea el pedido y descuenta stock.
 *
 * La reserva la hace `placeOrderTransactional` dentro de su transacción (es lo
 * que evita la sobreventa). El **compromiso** —bajar `on_hand` y escribir el
 * movimiento— se hace aquí porque el pago es simulado: con una pasarela real
 * ese paso pertenece al webhook de confirmación.
 */
export async function placeStorefrontOrder(
  input: PlaceStorefrontOrderInput,
  db: Database = getDb(),
): Promise<PlacedStorefrontOrder> {
  const quote = await quoteCartFromDb(
    { lines: input.lines, shippingMethod: input.shippingMethod },
    db,
  )
  if (quote.lines.length === 0) {
    throw new AppError('VALIDATION', 'El carrito está vacío')
  }

  const oversold = quote.lines.filter((line) => line.quantity > line.availableStock)
  if (oversold.length > 0) {
    throw new AppError(
      'OUT_OF_STOCK',
      oversold
        .map((line) => `Solo quedan ${line.availableStock} uds. de ${line.name} (${line.color})`)
        .join(' · '),
    )
  }

  const email = (input.userId ? input.email : input.customer.email).trim().toLowerCase()

  const placed = await placeOrderTransactional(
    {
      email,
      userId: input.userId,
      lines: quote.lines.map((line) => ({
        variantId: line.variantId,
        sku: line.sku,
        name: line.name,
        unitPriceCents: line.unitPrice.amount,
        quantity: line.quantity,
      })),
      totals: {
        subtotalCents: quote.subtotal.amount,
        shippingCents: quote.shipping.amount,
        taxCents: 0,
        totalCents: quote.total.amount,
      },
      shippingMethodId: await resolveShippingMethodId(input.shippingMethod, db),
      idempotencyKey: input.idempotencyKey,
      reservationTtlSeconds: STOREFRONT_RESERVATION_TTL_SECONDS,
    },
    db,
  )

  // Sin pasarela de pago el compromiso NO se hace aquí: el stock queda reservado
  // (bloqueado, no vendido) y la tienda lo compromete al confirmar el pedido por
  // WhatsApp desde el panel. Así una conversación que no llega a nada caduca sola.
  return {
    orderNumber: placed.number,
    total: money(placed.totalCents),
    status: placed.status,
    reservationIds: placed.reservationIds,
    reservedUntil: new Date(
      Date.now() + STOREFRONT_RESERVATION_TTL_SECONDS * 1_000,
    ).toISOString(),
  }
}

export interface StorefrontOrderSummary {
  readonly number: string
  readonly createdAt: string
  readonly total: Money
  readonly itemsCount: number
  readonly status: string
}

/** Pedidos de un titular. El filtro por email va en SQL, no en la UI. */
export async function listStorefrontOrders(
  email: string,
  db: Database = getDb(),
): Promise<StorefrontOrderSummary[]> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return []

  const rows = await db
    .select({
      id: ordersTable.id,
      number: ordersTable.number,
      createdAt: ordersTable.createdAt,
      totalCents: ordersTable.totalCents,
      status: ordersTable.status,
    })
    .from(ordersTable)
    .where(ilike(ordersTable.email, normalized))
    .orderBy(desc(ordersTable.createdAt))
    .limit(50)

  // Los artículos se cuentan en una consulta aparte: la subconsulta correlacionada
  // devolvía 0 a través del constructor de consultas (mismo caso que en usuarios).
  const ids = rows.map((row) => row.id)
  const counts =
    ids.length === 0
      ? []
      : await db
          .select({
            orderId: orderItems.orderId,
            units: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::int`,
          })
          .from(orderItems)
          .where(inArray(orderItems.orderId, ids))
          .groupBy(orderItems.orderId)
  const unitsByOrder = new Map(counts.map((row) => [row.orderId, Number(row.units)]))

  return rows.map((row) => ({
    number: row.number,
    createdAt: row.createdAt.toISOString(),
    total: money(Number(row.totalCents)),
    itemsCount: unitsByOrder.get(row.id) ?? 0,
    status: row.status,
  }))
}

export interface StorefrontOrderDetail {
  readonly number: string
  readonly status: string
  readonly createdAt: string
  readonly totals: { subtotal: Money; shipping: Money; total: Money }
  readonly lines: ReadonlyArray<{
    sku: string
    name: string
    quantity: number
    unitPrice: Money
    lineTotal: Money
  }>
}

/**
 * Detalle de un pedido **del titular**. La propiedad se comprueba en la propia
 * consulta: si el email no coincide, no hay fila y el resultado es `null` (no se
 * distingue «no existe» de «no es tuyo»).
 */
export async function findStorefrontOrderForOwner(
  orderNumber: string,
  ownerEmail: string,
  db: Database = getDb(),
): Promise<StorefrontOrderDetail | null> {
  const normalized = ownerEmail.trim().toLowerCase()
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.number, orderNumber),
        ilike(ordersTable.email, normalized),
      ),
    )
    .limit(1)
  if (!order) return null

  const lines = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id))
    .orderBy(asc(orderItems.createdAt))

  return {
    number: order.number,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    totals: {
      subtotal: money(order.subtotalCents),
      shipping: money(order.shippingCents),
      total: money(order.totalCents),
    },
    lines: lines.map((line) => ({
      sku: line.skuSnapshot,
      name: line.nameSnapshot,
      quantity: line.quantity,
      unitPrice: money(line.unitPriceCents),
      lineTotal: money(line.lineTotalCents),
    })),
  }
}

export interface PublicSettings {
  readonly currency: string
  readonly locale: string
  readonly freeShippingThresholdCents: number
  readonly whatsappPhone: string | null
  readonly whatsappName: string | null
}

/** Ajustes que puede leer la tienda (nada de secretos: son valores públicos). */
export async function readPublicSettings(db: Database = getDb()): Promise<PublicSettings> {
  const rows = await db
    .select({ key: siteSettings.key, value: siteSettings.value })
    .from(siteSettings)
    .where(
      inArray(siteSettings.key, [
        'site.currency',
        'site.locale',
        'shipping.free_threshold_cents',
        'contact.whatsapp',
        'contact.whatsapp_name',
      ]),
    )
  const byKey = new Map(rows.map((row) => [row.key, row.value]))
  const threshold = Number(
    byKey.get('shipping.free_threshold_cents') ?? DEFAULT_FREE_SHIPPING_THRESHOLD_CENTS,
  )
  const phone = byKey.get('contact.whatsapp')
  const name = byKey.get('contact.whatsapp_name')
  return {
    currency: String(byKey.get('site.currency') ?? 'EUR'),
    locale: String(byKey.get('site.locale') ?? 'es-ES'),
    freeShippingThresholdCents: Number.isFinite(threshold)
      ? threshold
      : DEFAULT_FREE_SHIPPING_THRESHOLD_CENTS,
    whatsappPhone: typeof phone === 'string' ? phone : null,
    whatsappName: typeof name === 'string' ? name : null,
  }
}