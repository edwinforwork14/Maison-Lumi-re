import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isFreeShipping,
  shippingCostFor,
  amountToFreeShipping,
  FREE_SHIPPING_THRESHOLD,
  type ShippingMethod,
} from '../src/domain/pricing/rules.ts'

const methods: ShippingMethod[] = [
  { id: 'standard', name: 'Estándar', description: '3 – 5 días', price: 12 },
  { id: 'express', name: 'Express', description: '24 – 48 h', price: 24 },
]

describe('pricing: umbral de envío gratuito', () => {
  it('es gratuito exactamente en 500 € (comportamiento actual)', () => {
    assert.equal(FREE_SHIPPING_THRESHOLD, 500)
    assert.equal(isFreeShipping(499.99), false)
    assert.equal(isFreeShipping(500), true)
    assert.equal(isFreeShipping(1200), true)
  })

  it('amountToFreeShipping devuelve el resto y cero al cruzar el umbral', () => {
    assert.equal(amountToFreeShipping(300), 200)
    assert.equal(amountToFreeShipping(500), 0)
    assert.equal(amountToFreeShipping(700), 0)
  })
})

describe('pricing: coste por método (fuente única, defecto D5)', () => {
  it('cobra el precio del método bajo el umbral', () => {
    assert.equal(shippingCostFor(methods, 'standard', 100), 12)
    assert.equal(shippingCostFor(methods, 'express', 100), 24)
  })

  it('es gratuito con cualquier método al alcanzar el umbral', () => {
    assert.equal(shippingCostFor(methods, 'standard', 500), 0)
    assert.equal(shippingCostFor(methods, 'express', 800), 0)
  })

  it('devuelve 0 con método desconocido (fallback del comportamiento actual)', () => {
    assert.equal(
      shippingCostFor(methods, 'noche' as ShippingMethod['id'], 100),
      0,
    )
  })
})
