import { useEffect, useState } from 'react'
import { PRELOADER_MAX_MS, PRELOADER_MIN_MS } from '@/lib/preloader'

/**
 * `true` cuando la página está lista (Plan 05 §6.1): `document.readyState`
 * completo (o evento `load`) Y las fuentes cargadas, con un tope de
 * `PRELOADER_MAX_MS` para no esperar indefinidamente a ninguna de las dos.
 */
export function usePageReady(): boolean {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let settled = false
    const settle = () => {
      if (settled) return
      settled = true
      setReady(true)
    }

    // Tope: pase lo que pase, resolvemos.
    const maxTimer = window.setTimeout(settle, PRELOADER_MAX_MS)

    const loaded =
      document.readyState === 'complete'
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            window.addEventListener('load', () => resolve(), { once: true })
          })

    const fonts =
      'fonts' in document
        ? (document as Document & { fonts: FontFaceSet }).fonts.ready.then(() => undefined)
        : Promise.resolve()

    void Promise.all([loaded, fonts]).then(() => {
      // Mínimo visible: el logo no parpadea si la página carga al instante.
      const remaining = PRELOADER_MIN_MS - (performance.now() - startedAt)
      window.setTimeout(settle, Math.max(0, remaining))
    })

    const startedAt = performance.now()

    return () => window.clearTimeout(maxTimer)
  }, [])

  return ready
}
