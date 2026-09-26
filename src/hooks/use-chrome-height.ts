import { useEffect } from 'react'

/**
 * Mide el chrome completo del storefront (anuncio + cabecera, Plan 05 §3.4)
 * y escribe `--chrome-h` en `document.documentElement` con un
 * `ResizeObserver`: se recalcula si el usuario cierra el anuncio o cambia el
 * contenido. El valor SSR por defecto (5.5rem) queda en `styles.css`.
 */
export function useChromeHeight(): void {
  useEffect(() => {
    const root = document.documentElement
    const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-chrome]'))

    const measure = () => {
      const total = elements.reduce((sum, el) => sum + el.offsetHeight, 0)
      root.style.setProperty('--chrome-h', `${Math.round(total)}px`)
    }

    measure()
    const observer = new ResizeObserver(measure)
    for (const el of elements) observer.observe(el)

    return () => observer.disconnect()
  }, [])
}
