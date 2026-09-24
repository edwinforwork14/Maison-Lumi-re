import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  canTransition,
  transition,
  ORDER_TRANSITIONS,
  InvalidOrderTransitionError,
  type Order,
} from '../src/domain/order/order.ts'
import { money } from '../src/domain/money/money.ts'

const baseOrder: Order = {
  id: 'o1',
  number: 'ML-TEST-0001',
  status: 'placed',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  lines: [
    {
      productId: 'p1',
      sku: 'P1-NEG',
      name: 'Pieza',
      unitPrice: money(15000),
      quantity: 1,
      lineTotal: money(15000),
    },
  ],
  totals: {
    subtotal: money(15000),
    shipping: money(0),
    tax: money(0),
    total: money(15000),
  },
  idempotencyKey: 'idem-1',
}

describe('order: transiciones válidas', () => {
  it('declara el ciclo de vida del plan (§4.7)', () => {
    assert.deepEqual(ORDER_TRANSITIONS.draft, ['placed', 'cancelled'])
    assert.deepEqual(ORDER_TRANSITIONS.placed, ['paid', 'cancelled'])
    assert.deepEqual(ORDER_TRANSITIONS.paid, ['fulfilled', 'refunded'])
    assert.deepEqual(ORDER_TRANSITIONS.fulfilled, ['refunded'])
    assert.deepEqual(ORDER_TRANSITIONS.cancelled, [])
    assert.deepEqual(ORDER_TRANSITIONS.refunded, [])
  })

  it('canTransition acepta el camino feliz', () => {
    assert.ok(canTransition('draft', 'placed'))
    assert.ok(canTransition('placed', 'paid'))
    assert.ok(canTransition('paid', 'fulfilled'))
  })

  it('rechaza saltos y estados terminales', () => {
    assert.ok(!canTransition('draft', 'paid'))
    assert.ok(!canTransition('cancelled', 'placed'))
    assert.ok(!canTransition('refunded', 'paid'))
  })
})

describe('order: transition inmutable', () => {
  it('devuelve un pedido nuevo con el estado cambiado', () => {
    const paid = transition(baseOrder, 'paid')
    assert.equal(paid.status, 'paid')
    assert.notEqual(paid.updatedAt, baseOrder.updatedAt)
    assert.equal(baseOrder.status, 'placed', 'el original no muta')
  })

  it('lanza InvalidOrderTransitionError en transición ilegal', () => {
    assert.throws(
      () => transition(baseOrder, 'fulfilled'),
      InvalidOrderTransitionError,
    )
  })
})
