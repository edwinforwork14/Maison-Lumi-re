import { useEffect, useState } from 'react'

/**
 * Isla flotante de la PLP (Plan 04 §2.6): se oculta al hacer scroll hacia
 * abajo y reaparece al subir (`transition: transform .15s`).
 *
 * @param threshold px mínimos de desplazamiento para reaccionar (evita
 *   cambios de dirección por el ruido del trackpad).
 */
export function useHideOnScroll(threshold = 8): boolean {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    let lastY = window.scrollY

    const onScroll = () => {
      const y = window.scrollY
      if (Math.abs(y - lastY) <= threshold) return
      // Hacia arriba (o en lo alto de la página): visible.
      setVisible(y < lastY || y <= 0)
      lastY = y
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])

  return visible
}
