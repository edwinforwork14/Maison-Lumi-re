import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isFreeShipping,
  shippingCostFor,
  amountToFreeShipping,
  FREE_SHIPPING_THRESHOLD,
  type ShippingMethod,
} from '../src/domain/pricing/rules.ts'
import { money } from '../src/domain/money/money.ts'

const methods: ShippingMethod[] = [
  { id: 'standard', name: 'Estándar', description: '3 – 5 días', price: money(1_200) },
  { id: 'express', name: 'Express', description: '24 – 48 h', price: money(2_400) },
]

describe('pricing: umbral de envío gratuito (en céntimos)', () => {
  it('el umbral es 500,00 € expresado en céntimos', () => {
    assert.equal(FREE_SHIPPING_THRESHOLD.amount, 50_000)
    assert.equal(FREE_SHIPPING_THRESHOLD.currency, 'EUR')
  })

  it('es gratuito exactamente al alcanzar el umbral', () => {
    assert.equal(isFreeShipping(money(49_999)), false)
    assert.equal(isFreeShipping(money(50_000)), true)
    assert.equal(isFreeShipping(money(120_000)), true)
  })

  it('amountToFreeShipping devuelve el resto y cero al cruzar el umbral', () => {
    assert.equal(amountToFreeShipping(money(30_000)).amount, 20_000)
    assert.equal(amountToFreeShipping(money(50_000)).amount, 0)
    assert.equal(amountToFreeShipping(money(70_000)).amount, 0)
  })
})

describe('pricing: coste por método (fuente única, defecto D5)', () => {
  it('cobra el precio del método bajo el umbral', () => {
    assert.equal(shippingCostFor(methods, 'standard', money(10_000)).amount, 1_200)
    assert.equal(shippingCostFor(methods, 'express', money(10_000)).amount, 2_400)
  })

  it('es gratuito con cualquier método al alcanzar el umbral', () => {
    assert.equal(shippingCostFor(methods, 'standard', money(50_000)).amount, 0)
    assert.equal(shippingCostFor(methods, 'express', money(80_000)).amount, 0)
  })

  it('devuelve cero con método desconocido (fallback explícito)', () => {
    assert.equal(
      shippingCostFor(methods, 'noche' as ShippingMethod['id'], money(10_000)).amount,
      0,
    )
  })

  it('nunca devuelve importes con decimales (aritmética entera)', () => {
    const cost = shippingCostFor(methods, 'express', money(33_333))
    assert.ok(Number.isInteger(cost.amount))
  })
})
