import { useEffect, useState } from 'react'
import { resolveHeaderState, type HeaderState } from '@/lib/scroll-state'

/**
 * Estado `top`/`scrolled` de la cabecera (Plan 05 §3.1): listener `scroll`
 * pasivo + `requestAnimationFrame` (una lectura por frame, sin layout
 * thrashing). Lee la posición inicial al montar (respeta la posición
 * restaurada por el navegador) y limpia el listener al desmontar.
 *
 * `force` fuerza `scrolled` (el mega dropdown abierto mantiene la cabecera
 * opaca aunque el scroll esté arriba).
 */
export function useScrollState(force = false): HeaderState {
  const [state, setState] = useState<HeaderState>('top')

  useEffect(() => {
    let frame = 0
    const read = () => {
      frame = 0
      setState((current) => resolveHeaderState({ y: window.scrollY, state: current }))
    }
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(read)
    }

    // Lectura inicial: respeta la posición restaurada por el navegador (F5 a media página).
    read()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [])

  return force ? 'scrolled' : state
}
