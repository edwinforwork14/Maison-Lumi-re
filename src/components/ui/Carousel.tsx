import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

/**
 * Carrusel genérico con scroll-snap nativo (Plan 04 §2.12): sin dependencias.
 * Dots como barra de 1 px (activo en `--text-primary`), flechas que sólo
 * aparecen en hover con puntero fino, y avance por teclado accesible.
 */
export function Carousel({
  children,
  label,
  className,
}: {
  children: ReactNode
  label: string
  className?: string
}) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [page, setPage] = useState(0)
  const [pages, setPages] = useState(1)

  const measure = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    const pageCount = Math.max(1, Math.ceil(track.scrollWidth / track.clientWidth))
    setPages(pageCount)
    setPage(Math.round(track.scrollLeft / Math.max(1, track.clientWidth)))
  }, [])

  useEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  const go = (direction: 1 | -1) => {
    const track = trackRef.current
    if (!track) return
    track.scrollBy({ left: direction * track.clientWidth, behavior: 'smooth' })
  }

  return (
    <div className={`group/carousel relative ${className ?? ''}`}>
      <div
        ref={trackRef}
        onScroll={measure}
        role="group"
        aria-label={label}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>

      {/* Flechas: visibles sólo en hover con puntero fino (§9). */}
      <button
        type="button"
        onClick={() => go(-1)}
        aria-label="Anterior"
        className="absolute left-4 top-1/2 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-frost text-strong opacity-0 shadow-frost backdrop-blur-[10px] transition-opacity duration-200 hover:bg-frost-transparent [@media(hover:hover)and(pointer:fine)]:group-hover/carousel:opacity-100 md:grid"
      >
        <Icon name="chevron-left" />
      </button>
      <button
        type="button"
        onClick={() => go(1)}
        aria-label="Siguiente"
        className="absolute right-4 top-1/2 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-frost text-strong opacity-0 shadow-frost backdrop-blur-[10px] transition-opacity duration-200 hover:bg-frost-transparent [@media(hover:hover)and(pointer:fine)]:group-hover/carousel:opacity-100 md:grid"
      >
        <Icon name="chevron-right" />
      </button>

      {/* Dots como barra de 1 px (§2.12). */}
      {pages > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          {Array.from({ length: pages }).map((_, index) => (
            <span
              key={index}
              className={`h-px w-6 transition-colors ${
                index === page ? 'bg-text-primary' : 'bg-line'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
