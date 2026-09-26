import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PRELOADER_MIN_MS,
  PRELOADER_MAX_MS,
  PRELOADER_HARD_STOP_MS,
  resolvePreloaderPhase,
} from '../src/lib/preloader.ts'

/**
 * Fases del preloader (Plan 05 §6.1): la decisión es pura — tiempo mínimo,
 * página lista y tope absoluto.
 */
describe('resolvePreloaderPhase', () => {
  it('hold mientras no se alcance el mínimo, aunque la página esté lista', () => {
    assert.equal(
      resolvePreloaderPhase({ elapsedMs: 0, pageReady: true }),
      'hold',
    )
    assert.equal(
      resolvePreloaderPhase({ elapsedMs: PRELOADER_MIN_MS - 1, pageReady: true }),
      'hold',
    )
    assert.equal(
      resolvePreloaderPhase({ elapsedMs: 5_000, pageReady: false }),
      'hold',
    )
  })

  it('exit cuando la página está lista y pasó el mínimo', () => {
    assert.equal(
      resolvePreloaderPhase({ elapsedMs: PRELOADER_MIN_MS, pageReady: true }),
      'exit',
    )
    assert.equal(
      resolvePreloaderPhase({ elapsedMs: PRELOADER_MAX_MS, pageReady: true }),
      'exit',
    )
  })

  it('tope absoluto: exit a los PRELOADER_HARD_STOP_MS pase lo que pase', () => {
    assert.equal(
      resolvePreloaderPhase({ elapsedMs: PRELOADER_HARD_STOP_MS, pageReady: false }),
      'exit',
    )
    assert.equal(
      resolvePreloaderPhase({ elapsedMs: PRELOADER_HARD_STOP_MS + 1, pageReady: false }),
      'exit',
    )
  })

  it('entre el mínimo y el tope, sin página lista, sigue en hold', () => {
    assert.equal(
      resolvePreloaderPhase({
        elapsedMs: PRELOADER_MIN_MS + 1,
        pageReady: false,
      }),
      'hold',
    )
  })
})

describe('shouldSkipPreloader', () => {
  it('la animación se fuerza siempre (decisión del usuario)', () => {
    assert.equal(resolvePreloaderPhase({ elapsedMs: PRELOADER_MIN_MS, pageReady: true }), 'exit')
    // La omisión por motion reducido se retiró: el preloader se anima
    // siempre, también con `prefers-reduced-motion: reduce`.
    assert.equal(PRELOADER_HARD_STOP_MS > PRELOADER_MIN_MS, true)
  })
})
