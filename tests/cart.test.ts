import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  cartReducer,
  cartCount,
  cartSubtotal,
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

describe('cart: selectores', () => {
  const catalog = new Map([
    ['p1', { id: 'p1', price: 100 }],
    ['p2', { id: 'p2', price: 50 }],
  ])
  const find = (id: string) => catalog.get(id)

  it('cartCount suma unidades', () => {
    assert.equal(cartCount(seed), 2)
    assert.equal(cartCount([]), 0)
  })

  it('cartSubtotal ignora productos retirados y suma los válidos', () => {
    const state: CartLine[] = [
      { productId: 'p1', color: 'Negro', quantity: 2 },
      { productId: 'gone', color: '-', quantity: 5 },
      { productId: 'p2', color: 'X', quantity: 1 },
    ]
    assert.equal(cartSubtotal(state, find), 250)
  })

  it('cartSubtotal de carrito vacío es 0', () => {
    assert.equal(cartSubtotal([], find), 0)
  })
})
