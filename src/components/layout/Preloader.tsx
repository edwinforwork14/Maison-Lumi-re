import { useEffect, useRef, useState } from 'react'
import {
  PRELOADER_EXIT_MS,
  PRELOADER_HARD_STOP_MS,
  resolvePreloaderPhase,
  type PreloaderPhase,
} from '@/lib/preloader'
import { usePageReady } from '@/hooks/use-page-ready'
import LOGO_URL from '@/assets/brand/logo.svg'

/**
 * Pantalla de carga (Plan 05 §6): overlay negro de marca con el logo en
 * blanco; al estar lista la página, se parte por la mitad vertical —las dos
 * mitades se separan mientras se desintegran (bandas + blur)— y cada mitad
 * del logo sale hacia su lado con la misma disolución (§6.3).
 *
 * Regla dura (§6.4): el preloader NUNCA atrapa al usuario.
 * - Tope absoluto `PRELOADER_HARD_STOP_MS`: se retira pase lo que pase.
 * - `<noscript>` lo oculta sin JS (en `_storefront.tsx`).
 * - Se anima SIEMPRE (decisión del usuario), incluso con motion reducido.
 * - `role="status"` + etiqueta; el scroll se restaura siempre.
 *
 * La fase tiene UN SOLO dueño: el reloj. Decide con el `pageReady` real
 * (antes el intervalo recalculaba con `pageReady: false` y deshacía la
 * salida) y nunca deshace `done` (antes los ticks podían revivir el
 * overlay después del desmontaje).
 */

/**
 * Estado a nivel de MÓDULO: sobrevive a remontajes de React (hidratación,
 * re-render del layout) que reiniciarían `useState`/`useRef` y hacían que
 * la secuencia empezara de nuevo — el bug de la "doble carga". Una carga
 * completa de página = una sola secuencia.
 */
const session = {
  /** Inicio del reloj, la primera vez que se monta el componente. */
  startedAt: null as number | null,
  /** La secuencia ya terminó en esta carga de página: no volver a montar. */
  done: false,
}

export function Preloader() {
  // Si ya se reprodujo en esta carga (remontaje tras `done`), nada.
  const [phase, setPhase] = useState<PreloaderPhase>(() =>
    session.done ? 'done' : 'hold',
  )
  const pageReady = usePageReady()

  useEffect(() => {
    if (session.done) return
    if (session.startedAt === null) session.startedAt = performance.now()

    const tick = () => {
      const elapsedMs = performance.now() - session.startedAt!
      setPhase((current) =>
        current === 'done'
          ? current
          : resolvePreloaderPhase({ elapsedMs, pageReady }),
      )
    }

    tick()
    const interval = window.setInterval(tick, 100)
    return () => window.clearInterval(interval)
  }, [pageReady])

  // Desmontaje: reacción al fin de la salida (temporizador; los `animationend`
  // de las mitades llegan dentro de esta ventana) y desbloqueo del scroll.
  // Decisión del usuario: la secuencia se anima SIEMPRE, también con
  // motion reducido (el CSS exime al preloader del bloque global).
  useEffect(() => {
    if (phase !== 'exit') return
    const timer = window.setTimeout(() => {
      session.done = true
      setPhase('done')
    }, PRELOADER_EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  // Red de seguridad adicional: si el reloj fallara por completo, un
  // temporizador independiente retira el overlay al tope duro (§6.4).
  useEffect(() => {
    const hardStop = window.setTimeout(
      () =>
        setPhase((current) =>
          current === 'hold' || current === 'exit' ? 'exit' : current,
        ),
      PRELOADER_HARD_STOP_MS,
    )
    return () => window.clearTimeout(hardStop)
  }, [])

  // Bloqueo de scroll con restauración garantizada (§6.4).
  useEffect(() => {
    if (phase === 'done') return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [phase])

  if (phase === 'done') return null

  const exiting = phase === 'exit'

  return (
    <div
      id="preloader"
      role="status"
      aria-label="Cargando"
      className={exiting ? 'preloader-exiting' : undefined}
    >
      {/* Las dos mitades de la superficie: se separan hacia los lados. */}
      <div aria-hidden className="preloader-half-left" />
      <div aria-hidden className="preloader-half-right" />

      {/* Logo duplicado con recorte: cada mitad sale hacia su lado. */}
      <div className="preloader-logo" aria-hidden>
        <div className="preloader-logo-half-left">
          <img src={LOGO_URL} alt="" className="h-10 w-auto" />
        </div>
        <div className="preloader-logo-half-right">
          <img
            src={LOGO_URL}
            alt=""
            className="h-10 w-auto"
            // Respaldo textual si el SVG no cargara (§6.5).
            onError={(e) => {
              const img = e.currentTarget
              const text = document.createElement('span')
              text.textContent = 'Maison Lumière'
              text.className =
                'text-[15px] font-medium uppercase tracking-[0.35em]'
              img.replaceWith(text)
            }}
          />
        </div>
      </div>

      {/* Progreso indeterminado (§6.3). */}
      <div aria-hidden className="preloader-progress" />
    </div>
  )
}
