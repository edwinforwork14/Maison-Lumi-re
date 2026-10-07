/**
 * Fases del preloader (Plan 05 §6.1): lógica pura y testeable. La decisión
 * de fase sólo depende del tiempo transcurrido y de si la página está lista;
 * el componente no hace más que aplicarlas.
 */

export type PreloaderPhase = 'hold' | 'exit' | 'done'

export const PRELOADER_MIN_MS = 700
export const PRELOADER_MAX_MS = 4000
/** Tope absoluto: pase lo que pase, el preloader se retira (§6.4). */
export const PRELOADER_HARD_STOP_MS = 6000
/**
 * Duración total de la secuencia de salida (§6.3): el fondo y la mariposa
 * abren al unísono (0.9 s desde 0 s) y las letras salen después (1.08 s desde
 * 0.24 s), así que la última termina a los 1.32 s. Margen corto para el último
 * frame.
 */
export const PRELOADER_EXIT_MS = 1500

export function resolvePreloaderPhase(input: {
  elapsedMs: number
  pageReady: boolean
}): PreloaderPhase {
  const { elapsedMs, pageReady } = input

  // Tope duro: nunca retener al usuario más de 6 s.
  if (elapsedMs >= PRELOADER_HARD_STOP_MS) return 'exit'
  if (pageReady && elapsedMs >= PRELOADER_MIN_MS) return 'exit'
  return 'hold'
}

export function shouldSkipPreloader(input: { reducedMotion: boolean }): boolean {
  return input.reducedMotion
}
