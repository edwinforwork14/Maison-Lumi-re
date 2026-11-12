import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSiteSettings } from '@/features/commerce.api'
import { queryKeys } from '@/features/model/queries'
import { formatCents } from '@/lib/money-format'
import { Icon } from '@/components/ui/Icon'
import type { HeaderState } from '@/lib/scroll-state'

/**
 * Franja de anuncios (Plan 04 §2.0): mensajes en rotación con fundido
 * y botón de cierre. El umbral de envío sale de `site_settings` (defecto
 * D37): la franja no hardcodea importes.
 *
 * Plan 05 §3.3: mientras la cabecera está en `top` la franja es transparente
 * (se mezcla con el hero); `data-chrome` permite medir el chrome completo.
 */
export function AnnouncementBar({
  headerState = 'scrolled',
}: {
  /** Estado de la cabecera: en `top` la franja pierde fondo y borde. */
  readonly headerState?: HeaderState
}) {
  const [closed, setClosed] = useState(false)
  const [index, setIndex] = useState(0)

  const { data: settings } = useQuery({
    queryKey: queryKeys.siteSettings(),
    queryFn: () => getSiteSettings(),
    staleTime: 5 * 60_000,
  })

  const messages = useMemo(
    () => [
      settings
        ? `Envío gratuito a partir de ${formatCents(settings.freeShippingThresholdCents)} · Devoluciones extendidas 30 días`
        : 'Envío gratuito · Devoluciones extendidas 30 días',
      'Nueva colección · Otoño 2026',
    ],
    [settings],
  )

  useEffect(() => {
    if (closed || messages.length < 2) return
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % messages.length)
    }, 4_000)
    return () => clearInterval(timer)
  }, [closed, messages.length])

  if (closed) return null

  return (
    <div
      data-chrome="announcement"
      data-header-state={headerState}
      data-animation="fade-in"
      className="relative border-b border-line bg-surface px-4 md:px-12 py-2 text-center transition-colors"
    >
      {/* `key` reinicia la animación de fundido en cada rotación. */}
      <p key={index} className="body-text animate-fade-in text-text-secondary">
        {messages[index]}
      </p>
      <button
        type="button"
        onClick={() => setClosed(true)}
        aria-label="Cerrar aviso"
        className="absolute right-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center text-text-secondary transition-colors hover:text-strong"
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  )
}
