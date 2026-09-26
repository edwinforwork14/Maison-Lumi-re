import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  TOP_MAX,
  SCROLL_MIN,
  resolveHeaderState,
  type HeaderState,
} from '../src/lib/scroll-state.ts'

/**
 * Estado de la cabecera (Plan 05 §3.1): umbrales con histéresis — se entra
 * en `scrolled` a partir de 6 px y sólo se vuelve a `top` por debajo de 4 px.
 */
describe('resolveHeaderState', () => {
  it('arranca en top y no cambia por debajo del umbral de scroll', () => {
    assert.equal(resolveHeaderState({ y: 0, state: 'top' }), 'top')
    assert.equal(resolveHeaderState({ y: 3, state: 'top' }), 'top')
    assert.equal(resolveHeaderState({ y: SCROLL_MIN - 1, state: 'top' }), 'top')
  })

  it('entra en scrolled al alcanzar el umbral de scroll', () => {
    assert.equal(resolveHeaderState({ y: SCROLL_MIN, state: 'top' }), 'scrolled')
    assert.equal(resolveHeaderState({ y: 100, state: 'top' }), 'scrolled')
    assert.equal(resolveHeaderState({ y: 5, state: 'top' }), 'top')
  })

  it('histéresis: desde scrolled no vuelve a top hasta bajar de TOP_MAX', () => {
    assert.equal(resolveHeaderState({ y: TOP_MAX + 1, state: 'scrolled' }), 'scrolled')
    assert.equal(resolveHeaderState({ y: 5, state: 'scrolled' }), 'scrolled')
  })

  it('vuelve a top por debajo de TOP_MAX (zona de histéresis)', () => {
    assert.equal(resolveHeaderState({ y: TOP_MAX, state: 'scrolled' }), 'top')
    assert.equal(resolveHeaderState({ y: 0, state: 'scrolled' }), 'top')
  })

  it('la zona entre TOP_MAX y SCROLL_MIN depende del estado previo', () => {
    // y=5: con estado `top` sigue en top; con `scrolled` sigue scrolled.
    const y = TOP_MAX + 1
    assert.equal(resolveHeaderState({ y, state: 'top' as HeaderState }), 'top')
    assert.equal(resolveHeaderState({ y, state: 'scrolled' as HeaderState }), 'scrolled')
  })
})
