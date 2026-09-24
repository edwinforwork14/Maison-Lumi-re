/**
 * Servicios de cotización y pedidos (plan.md §4.5–§4.7).
 * El servidor es la única autoridad de precios, stock y totales (regla de
 * oro 2): el cliente pinta el resultado de `quoteCart`, nunca calcula.
 *
 * Todo importe es `Money` en céntimos (defectos D17/D21): aquí no existe
 * ningún precio en euros decimales ni formateo de importes.
 */

import { AppError } from '../errors.ts'
import { logger } from '../logger.ts'
import {
  catalogRepository,
  type ProductSeed,
  type ProductVariantSeed,
} from '../seed/catalog.ts'
import { add, money, multiply, sum, type Money } from '../../domain/money/money.ts'
import {
  amountToFreeShipping,
  isFreeShipping,
  shippingCostFor,
  type ShippingMethodId,
} from '../../domain/pricing/rules.ts'
import { shippingMethods } from '../../data/shipping.ts'

/** Tope duro por línea: protección contra payloads absurdos. */
const MAX_QUANTITY_PER_LINE = 99

// ─── Cotización autoritativa del carrito (defectos D5 y D18) ─────────────────

export interface QuoteLine {
  readonly productId: string
  readonly variantId: string
  readonly slug: string
  readonly sku: string
  readonly name: string
  readonly color: string
  readonly image: string
  readonly unitPrice: Money
  readonly quantity: number
  readonly lineTotal: Money
  /** Unidades disponibles del SKU: es el tope real de cantidad (D18). */
  readonly availableStock: number
  readonly availability: 'in_stock' | 'low' | 'out_of_stock'
}

export interface ShippingOptionQuote {
  readonly id: ShippingMethodId
  readonly label: string
  readonly description: string
  readonly price: Money
  readonly free: boolean
}

export interface CartQuote {
  readonly lines: readonly QuoteLine[]
  readonly subtotal: Money
  readonly shipping: Money
  readonly total: Money
  readonly freeShippingRemaining: Money
  readonly shippingOptions: readonly ShippingOptionQuote[]
}

export interface QuoteInput {
  readonly lines: ReadonlyArray<{ productId: string; color: string; quantity: number }>
  readonly shippingMethod?: ShippingMethodId
}

function variantOf(product: ProductSeed, color: string): ProductVariantSeed | undefined {
  return product.variants.find((v) => v.color === color)
}

function availabilityOf(stock: number): QuoteLine['availability'] {
  if (stock === 0) return 'out_of_stock'
  return stock <= 3 ? 'low' : 'in_stock'
}

export function quoteCart(input: QuoteInput): CartQuote {
  const lines: QuoteLine[] = []
  for (const item of input.lines) {
    const product = catalogRepository.findByIds([item.productId])[0]
    if (!product) continue // producto retirado: la línea cae de la cotización
    const variant = variantOf(product, item.color)
    if (!variant) continue
    const quantity = Math.max(
      0,
      Math.min(Math.trunc(item.quantity), MAX_QUANTITY_PER_LINE),
    )
    const unitPrice = money(variant.priceCents)
    lines.push({
      productId: product.id,
      variantId: variant.id,
      slug: product.slug,
      sku: variant.sku,
      name: product.name,
      color: variant.color,
      image: product.images[0] ?? '',
      unitPrice,
      quantity,
      lineTotal: multiply(unitPrice, quantity),
      availableStock: variant.stock,
      availability: availabilityOf(variant.stock),
    })
  }

  const subtotal = sum(lines.map((l) => l.lineTotal))

  // El envío también sale del servidor: la UI no conoce precios ni umbrales.
  const shippingOptions: ShippingOptionQuote[] = shippingMethods.map((m) => ({
    id: m.id,
    label: m.name,
    description: m.description,
    price: shippingCostFor(shippingMethods, m.id, subtotal),
    free: isFreeShipping(subtotal),
  }))

  const method = input.shippingMethod ?? 'standard'
  const shipping =
    shippingOptions.find((o) => o.id === method)?.price ?? money(0, subtotal.currency)

  return {
    lines,
    subtotal,
    shipping,
    total: add(subtotal, shipping),
    freeShippingRemaining: amountToFreeShipping(subtotal),
    shippingOptions,
  }
}

// ─── Pedidos: repositorio in-memory con idempotencia (defectos D6/D7) ────────

export interface ServerOrder {
  readonly number: string
  readonly createdAt: string
  readonly customer: {
    readonly firstName: string
    readonly lastName: string
    readonly email: string
    readonly address: string
    readonly city: string
    readonly postalCode: string
    readonly country: string
  }
  readonly shippingMethod: ShippingMethodId
  readonly lines: readonly QuoteLine[]
  readonly totals: {
    readonly subtotal: Money
    readonly shipping: Money
    readonly total: Money
  }
}

const ordersByNumber = new Map<string, ServerOrder>()
const ordersByIdempotencyKey = new Map<string, ServerOrder>()

function generateOrderNumber(): string {
  const stamp = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `ML-${stamp}-${rand}`
}

export interface PlaceOrderInput extends QuoteInput {
  readonly customer: ServerOrder['customer']
  readonly idempotencyKey: string
}

export function placeOrder(input: PlaceOrderInput): ServerOrder {
  const existing = ordersByIdempotencyKey.get(input.idempotencyKey)
  if (existing) return existing // reintentos y doble clic no duplican (§4.7)

  const quote = quoteCart(input)
  if (quote.lines.length === 0) {
    throw new AppError('VALIDATION', 'El carrito está vacío')
  }

  const soldOut = quote.lines.filter((l) => l.availableStock === 0)
  if (soldOut.length > 0) {
    throw new AppError(
      'OUT_OF_STOCK',
      `Sin stock: ${soldOut.map((l) => l.name).join(', ')}`,
    )
  }

  // D18: la cantidad pedida nunca puede superar el stock real del SKU.
  const oversold = quote.lines.filter((l) => l.quantity > l.availableStock)
  if (oversold.length > 0) {
    throw new AppError(
      'OUT_OF_STOCK',
      oversold
        .map((l) => `Solo quedan ${l.availableStock} uds. de ${l.name} (${l.color})`)
        .join(' · '),
    )
  }

  const order: ServerOrder = {
    number: generateOrderNumber(),
    createdAt: new Date().toISOString(),
    customer: input.customer,
    shippingMethod: input.shippingMethod ?? 'standard',
    lines: quote.lines,
    totals: {
      subtotal: quote.subtotal,
      shipping: quote.shipping,
      total: quote.total,
    },
  }

  ordersByNumber.set(order.number, order)
  ordersByIdempotencyKey.set(input.idempotencyKey, order)
  logger.info('order.placed', { route: 'placeOrder', orderNumber: order.number })
  return order
}

export function findOrderByNumber(number: string): ServerOrder | undefined {
  return ordersByNumber.get(number)
}

/** Pedidos de un cliente (in-memory: sobreviven mientras vive el proceso). */
export function listOrdersByCustomer(email: string): Array<{
  number: string
  createdAt: string
  total: Money
  itemsCount: number
}> {
  const normalized = email.trim().toLowerCase()
  return [...ordersByNumber.values()]
    .filter((o) => o.customer.email.toLowerCase() === normalized)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((o) => ({
      number: o.number,
      createdAt: o.createdAt,
      total: o.totals.total,
      itemsCount: o.lines.reduce((total, l) => total + l.quantity, 0),
    }))
}

/**
 * ¿Este pedido pertenece a esta identidad? (defecto D32)
 *
 * Función pura a propósito: es la regla que decide si se puede leer un pedido,
 * así que se prueba sin servidor ni base de datos. La comparación es sobre
 * email normalizado porque es el identificador que llevan los pedidos de la
 * tienda (los de administración van por `orders.user_id`).
 */
export function ownsOrder(
  order: { readonly customer: { readonly email: string } },
  userEmail: string | null | undefined,
): boolean {
  if (!userEmail) return false
  return order.customer.email.trim().toLowerCase() === userEmail.trim().toLowerCase()
}