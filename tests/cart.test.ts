import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  cartReducer,
  cartCount,
  clampQuantity,
  initialQuantity,
  type CartLine,
} from '../src/domain/cart/cart-reducer.ts'

const seed: CartLine[] = [{ productId: 'p1', color: 'Negro', quantity: 2 }]

describe('cart: reducer', () => {
  it('add a línea existente acumula cantidad', () => {
    const next = cartReducer(seed, { type: 'add', productId: 'p1', color: 'Negro' })
    assert.deepEqual(next, [{ productId: 'p1', color: 'Negro', quantity: 3 }])
  })

  it('add nueva línea la añade con cantidad 1 por defecto', () => {
    const next = cartReducer(seed, { type: 'add', productId: 'p2', color: 'Marfil' })
    assert.equal(next.length, 2)
    assert.deepEqual(next[1], { productId: 'p2', color: 'Marfil', quantity: 1 })
  })

  it('setQuantity a 0 elimina la línea', () => {
    const next = cartReducer(seed, {
      type: 'setQuantity',
      productId: 'p1',
      color: 'Negro',
      quantity: 0,
    })
    assert.deepEqual(next, [])
  })

  it('remove y clear', () => {
    assert.deepEqual(
      cartReducer(seed, { type: 'remove', productId: 'p1', color: 'Negro' }),
      [],
    )
    assert.deepEqual(cartReducer(seed, { type: 'clear' }), [])
  })

  it('no muta el estado previo', () => {
    cartReducer(seed, { type: 'add', productId: 'p2', color: 'X' })
    assert.equal(seed.length, 1)
  })
})

describe('cart: selectores (sin aritmética de dinero, defecto D5)', () => {
  it('cartCount suma unidades', () => {
    assert.equal(cartCount(seed), 2)
    assert.equal(cartCount([]), 0)
  })

  it('el reducer no conoce ningún importe: las líneas solo llevan cantidad', () => {
    const next = cartReducer([], { type: 'add', productId: 'p9', color: 'Beige', quantity: 4 })
    assert.deepEqual(Object.keys(next[0]!).sort(), ['color', 'productId', 'quantity'])
  })
})

describe('cart: tope por stock del SKU (defecto D18)', () => {
  it('clampQuantity nunca supera el stock disponible', () => {
    assert.equal(clampQuantity(5, 3), 3)
    assert.equal(clampQuantity(2, 30), 2)
  })

  it('clampQuantity no admite negativos ni decimales', () => {
    assert.equal(clampQuantity(-4, 10), 0)
    assert.equal(clampQuantity(2.7, 10), 2)
    assert.equal(clampQuantity(3, 0), 0)
  })

  it('initialQuantity no ofrece unidades cuando no hay stock', () => {
    assert.equal(initialQuantity(0), 0)
    assert.equal(initialQuantity(7), 1)
  })
})
