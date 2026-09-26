import { useCallback } from 'react'

/**
 * Onda expansiva en el punto exacto del puntero (Plan 05 §5.2), con Web
 * Animations API: sin re-render, sin estado, sin dependencias.
 *
 * - `pointerdown` → disco `.ripple-wave` en las coordenadas del puntero,
 *   escala 0 → 1 y opacidad .35 → 0; se elimina en `finished`.
 * - `Enter`/`Space` → onda centrada (paridad de teclado).
 * - `prefers-reduced-motion: reduce` → no hace nada.
 * - Sólo maneja eventos del navegador: seguro en SSR, sin `any`.
 */
export function useRipple() {
  const spawn = useCallback((host: HTMLElement, x: number, y: number) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const rect = host.getBoundingClientRect()
    // Radio suficiente para cubrir el botón desde el punto del clic.
    const radius = Math.hypot(
      Math.max(x - rect.left, rect.right - x),
      Math.max(y - rect.top, rect.bottom - y),
    )
    const size = radius * 2

    const wave = document.createElement('span')
    wave.className = 'ripple-wave'
    wave.setAttribute('aria-hidden', 'true')
    wave.style.width = `${size}px`
    wave.style.height = `${size}px`
    wave.style.left = `${x - rect.left - radius}px`
    wave.style.top = `${y - rect.top - radius}px`

    const variant = getComputedStyle(host).getPropertyValue('--wave-color').trim()
    if (variant) wave.style.background = variant

    host.appendChild(wave)
    const animation = wave.animate(
      [
        { transform: 'scale(0)', opacity: 0.35 },
        { transform: 'scale(1)', opacity: 0 },
      ],
      {
        duration: 520,
        easing: 'cubic-bezier(.23,1,.32,1)',
      },
    )
    animation.finished
      .then(() => wave.remove())
      .catch(() => wave.remove())
  }, [])

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      spawn(event.currentTarget, event.clientX, event.clientY)
    },
    [spawn],
  )

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      const host = event.currentTarget
      const rect = host.getBoundingClientRect()
      spawn(host, rect.left + rect.width / 2, rect.top + rect.height / 2)
    },
    [spawn],
  )

  return { onPointerDown, onKeyDown } as const
}
