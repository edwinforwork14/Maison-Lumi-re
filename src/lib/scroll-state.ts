/**
 * Estado de la cabecera (Plan 05 §3.1): dos estados con histéresis para que
 * el ruido del trackpad no produzca parpadeo — se sale de `top` a partir de
 * 6 px y se vuelve a `top` sólo por debajo de 4 px.
 */

export type HeaderState = 'top' | 'scrolled'

export const TOP_MAX = 4
export const SCROLL_MIN = 6

export function resolveHeaderState(input: {
  y: number
  state: HeaderState
}): HeaderState {
  if (input.state === 'top') {
    return input.y >= SCROLL_MIN ? 'scrolled' : 'top'
  }
  return input.y <= TOP_MAX ? 'top' : 'scrolled'
}
