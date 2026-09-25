/**
 * Tipos del carrito y reglas puras de propiedad del pedido.
 *
 * Vivían en `server/services/commerce.ts`, que además contenía los servicios en
 * memoria (cotización sin base y pedidos en un `Map`). Ese camino se eliminó: la
 * tienda siempre opera sobre PostgreSQL, así que aquí sólo quedan los tipos que
 * cruzan la frontera cliente↔servidor y la regla pura de propiedad.
 */

import type { Money } from '../../domain/money/money.ts'
import type { ShippingMethodId } from '../../domain/pricing/rules.ts'

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

/**
 * ¿Este pedido pertenece a esta identidad? (defecto D32)
 *
 * Función pura a propósito: es la regla que decide si se puede leer un pedido,
 * así que se prueba sin servidor ni base de datos.
 */
export function ownsOrder(
  order: { readonly customer: { readonly email: string } },
  userEmail: string | null | undefined,
): boolean {
  if (!userEmail) return false
  return order.customer.email.trim().toLowerCase() === userEmail.trim().toLowerCase()
}
