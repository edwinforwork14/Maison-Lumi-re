/**
 * Servicios de cotización y pedidos (plan.md §4.5–§4.7).
 * El servidor es la única autoridad de precios, stock y totales (regla de
 * oro 2): el cliente pinta el resultado de quoteCart, nunca calcula.
 */

import { AppError } from '../errors'
import { logger } from '../logger'
import {
  catalogRepository,
  type ProductSeed,
} from '../seed/catalog'
import { shippingCostFor, type ShippingMethodId } from '@/domain/pricing'
import { shippingMethods } from '../../data/shipping'
import { formatMajor } from '@/lib/money-format'

// ─── Cotización autoritativa del carrito (defecto D5) ────────────────────────

export interface QuoteLine {
  readonly productId: string
  readonly sku: string
  readonly name: string
  readonly color: string
  readonly image: string
  readonly unitPrice: number
  readonly quantity: number
  readonly lineTotal: number
  readonly availability: 'in_stock' | 'low' | 'out_of_stock'
}

export interface CartQuote {
  readonly lines: readonly QuoteLine[]
  readonly subtotal: number
  readonly shipping: number
  readonly total: number
  readonly freeShippingRemaining: number
}

export interface QuoteInput {
  readonly lines: ReadonlyArray<{ productId: string; color: string; quantity: number }>
  readonly shippingMethod?: ShippingMethodId
}

function variantOf(product: ProductSeed, color: string) {
  return product.variants.find((v) => v.color === color)
}

export function quoteCart(input: QuoteInput): CartQuote {
  const lines: QuoteLine[] = []
  for (const item of input.lines) {
    const product = catalogRepository.findByIds([item.productId])[0]
    if (!product) continue // producto retirado: la línea cae de la cotización
    const variant = variantOf(product, item.color)
    if (!variant) continue
    const quantity = Math.max(0, Math.min(item.quantity, 99))
    lines.push({
      productId: product.id,
      sku: variant.sku,
      name: product.name,
      color: variant.color,
      image: product.images[0] ?? '',
      unitPrice: variant.price,
      quantity,
      lineTotal: variant.price * quantity,
      availability:
        variant.stock === 0
          ? 'out_of_stock'
          : variant.stock <= 3
            ? 'low'
            : 'in_stock',
    })
  }

  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0)
  const method =
    input.shippingMethod ??
    (shippingMethods.find((m) => m.id === 'standard')?.id as ShippingMethodId)
  const shipping = shippingCostFor(shippingMethods, method, subtotal)
  const freeShippingRemaining = Math.max(0, 500 - subtotal)

  return {
    lines,
    subtotal: formatMajor(subtotal) === '' ? subtotal : subtotal, // números, no strings: el formateo es asunto del cliente
    shipping,
    total: subtotal + shipping,
    freeShippingRemaining,
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
  readonly totals: { readonly subtotal: number; readonly shipping: number; readonly total: number }
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

  const soldOut = quote.lines.filter((l) => l.availability === 'out_of_stock')
  if (soldOut.length > 0) {
    throw new AppError(
      'OUT_OF_STOCK',
      `Sin stock: ${soldOut.map((l) => l.name).join(', ')}`,
    )
  }

  const order: ServerOrder = {
    number: generateOrderNumber(),
    createdAt: new Date().toISOString(),
    customer: input.customer,
    shippingMethod:
      input.shippingMethod ??
      ('standard' as ShippingMethodId),
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
  total: number
  itemsCount: number
}> {
  email = email.trim().toLowerCase()
  return [...ordersByNumber.values()]
    .filter((o) => o.customer.email.toLowerCase() === email)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((o) => ({
      number: o.number,
      createdAt: o.createdAt,
      total: o.totals.total,
      itemsCount: o.lines.reduce((n, l) => n + l.quantity, 0),
    }))
}
