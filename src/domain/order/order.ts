/**
 * Entidad Order y transiciones válidas (plan.md Fase 1, domain/order).
 * El ciclo de vida es la fuente única: una transición no permitida es un
 * error de dominio, no un if disperso en la UI.
 */

import type { Money } from '../money/money'

export type OrderStatus =
  | 'draft'
  | 'placed'
  | 'paid'
  | 'fulfilled'
  | 'cancelled'
  | 'refunded'

export type OrderId = string
export type OrderNumber = string

export interface OrderTotals {
  readonly subtotal: Money
  readonly shipping: Money
  readonly tax: Money
  readonly total: Money
}

export interface OrderLine {
  readonly productId: string
  readonly sku: string
  readonly name: string
  readonly unitPrice: Money
  readonly quantity: number
  readonly lineTotal: Money
}

export interface Order {
  readonly id: OrderId
  readonly number: OrderNumber
  readonly status: OrderStatus
  readonly createdAt: string
  readonly updatedAt: string
  readonly lines: readonly OrderLine[]
  readonly totals: OrderTotals
  readonly idempotencyKey: string
}

/** Transiciones válidas (plan.md §4.7). */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  draft: ['placed', 'cancelled'],
  placed: ['paid', 'cancelled'],
  paid: ['fulfilled', 'refunded'],
  fulfilled: ['refunded'],
  cancelled: [],
  refunded: [],
}

export class InvalidOrderTransitionError extends Error {
  readonly from: OrderStatus
  readonly to: OrderStatus

  constructor(from: OrderStatus, to: OrderStatus) {
    super(`Transición de pedido no permitida: ${from} → ${to}`)
    this.name = 'InvalidOrderTransitionError'
    this.from = from
    this.to = to
  }
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to)
}

/** Versión inmutable: devuelve el pedido con el nuevo estado o lanza. */
export function transition(order: Order, to: OrderStatus): Order {
  if (!canTransition(order.status, to)) {
    throw new InvalidOrderTransitionError(order.status, to)
  }
  return { ...order, status: to, updatedAt: new Date().toISOString() }
}
