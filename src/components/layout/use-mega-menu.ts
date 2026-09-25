/**
 * Estado del mega dropdown (§18 del brief): un **único objeto de estado**
 * `{ isOpen, activeSection, activeFilters }` —nada de booleanos sueltos que
 * puedan entrar en conflicto— más la tolerancia de cierre que evita el
 * clásico efecto «abre → cierra → abre» al mover el ratón entre el botón,
 * el hueco del header y el panel (§2/§19).
 */

import { useEffect, useRef, useState } from 'react'
import type { MegaFilters } from './mega-menu.data'

export interface MegaMenuState {
  readonly isOpen: boolean
  /** Índice de la sección activa en `buildNavSections`. */
  readonly activeSection: number
  /** Filtro del enlace hoverizado; `null` = usar el de la sección. */
  readonly activeFilters: MegaFilters | null
}

/**
 * Tolerancia de cierre: cubre el recorrido botón → padding del header →
 * panel (≈16 px) sin dejar que el menú parpadee. Es un cierre corto y
 * cancelable, no un timeout largo que oculte errores de interacción (§19).
 */
const CLOSE_DELAY_MS = 120

const INITIAL_STATE: MegaMenuState = {
  isOpen: false,
  activeSection: 0,
  activeFilters: null,
}

export function useMegaMenu() {
  const [state, setState] = useState<MegaMenuState>(INITIAL_STATE)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * Sólo desktop con puntero fino existe el dropdown por hover; en tablet y
   * móvil táctil la navegación sigue siendo el modal por click (§13).
   */
  const [canHover, setCanHover] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    const sync = () => setCanHover(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const cancelClose = () => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  const open = () => {
    if (!canHover) return
    cancelClose()
    setState((s) => (s.isOpen ? s : { ...s, isOpen: true }))
  }

  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null
      setState((s) => (s.isOpen ? { ...s, isOpen: false } : s))
    }, CLOSE_DELAY_MS)
  }

  /** Cierre inmediato: click en un enlace, Escape (§15). */
  const close = () => {
    cancelClose()
    setState((s) => (s.isOpen ? { ...s, isOpen: false } : s))
  }

  /** Hover en una sección de la columna 1: cambia la columna 2 y resetea el enlace. */
  const hoverSection = (index: number) => {
    cancelClose()
    setState((s) => ({
      ...s,
      isOpen: true,
      activeSection: index,
      activeFilters: null,
    }))
  }

  /** Hover en un enlace de la columna 2: actualiza los productos (nivel 3). */
  const hoverLink = (filters: MegaFilters) => {
    cancelClose()
    setState((s) => ({ ...s, isOpen: true, activeFilters: filters }))
  }

  /** Escape cierra el panel si está abierto (§14/§15). */
  useEffect(() => {
    if (!state.isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isOpen])

  useEffect(() => cancelClose, [])

  return {
    state,
    canHover,
    open,
    cancelClose,
    scheduleClose,
    close,
    hoverSection,
    hoverLink,
  }
}

export type MegaMenuApi = ReturnType<typeof useMegaMenu>
