import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { queryProducts } from '@/data'
import { formatPrice } from '@/lib/format'

export function SearchOverlay({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (open) {
      setQuery('')
      const t = setTimeout(() => inputRef.current?.focus(), 100)
      return () => clearTimeout(t)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const results = query.trim() ? queryProducts({ search: query }) : []

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-ivory animate-fade-in">
      <div className="flex items-center justify-between border-b border-linen px-6 py-5 md:px-12">
        <p className="text-[11px] uppercase tracking-[0.3em] text-taupe">
          Búsqueda
        </p>
        <button
          type="button"
          onClick={onClose}
          className="text-xl text-taupe transition-colors hover:text-ink"
          aria-label="Cerrar búsqueda"
        >
          ✕
        </button>
      </div>

      <div className="px-6 py-10 md:px-12">
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results.length > 0) {
              navigate({
                to: '/products/$slug',
                params: { slug: results[0].slug },
              })
              onClose()
            }
          }}
          placeholder="Buscar productos…"
          className="w-full border-b border-linen bg-transparent pb-4 font-serif text-3xl font-light outline-none placeholder:text-linen focus:border-ink md:text-5xl"
        />

        {query.trim() === '' && (
          <p className="mt-8 text-sm text-taupe">
            Escribe para buscar entre nuestras piezas.
          </p>
        )}

        {query.trim() !== '' && results.length === 0 && (
          <p className="mt-8 text-sm text-taupe">
            No hay resultados para “{query}”. Prueba con otro término.
          </p>
        )}

        {results.length > 0 && (
          <ul className="mt-8 grid max-h-[50vh] grid-cols-2 gap-6 overflow-y-auto md:grid-cols-4">
            {results.slice(0, 8).map((p) => (
              <li key={p.id}>
                <Link
                  to="/products/$slug"
                  params={{ slug: p.slug }}
                  onClick={onClose}
                  className="group block"
                >
                  <div className="overflow-hidden bg-sand">
                    <img
                      src={p.images[0]}
                      alt={p.name}
                      className="aspect-3/4 w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  </div>
                  <p className="mt-3 text-sm">{p.name}</p>
                  <p className="text-sm text-taupe">{formatPrice(p.price)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
