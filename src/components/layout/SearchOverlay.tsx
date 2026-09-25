import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { listProducts } from '@/features/commerce.api'
import { formatCents } from '@/lib/money-format'
import { Modal } from '@/components/ui/Modal'

/**
 * Búsqueda como modal-header a pantalla completa (Plan 04 §2.2): input
 * grande sin serif, resultados en rejilla de 4. Sigue consultando la server
 * function en vivo (plan.md A2); el comportamiento de diálogo (Escape, foco,
 * trampa) lo aporta `Modal`.
 */
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

  // El foco inicial del modal cae en «Cerrar»; para escribir, va al input.
  useEffect(() => {
    if (open) {
      setQuery('')
      const timer = setTimeout(() => inputRef.current?.focus(), 100)
      return () => clearTimeout(timer)
    }
  }, [open])

  const trimmed = query.trim()

  const { data: results = [] } = useQuery({
    queryKey: ['search', trimmed],
    queryFn: () => listProducts({ data: { search: trimmed } }),
    enabled: open && trimmed.length > 0,
  })

  return (
    <Modal open={open} onClose={onClose} title="Buscar" mode="fullscreen">
      <div className="px-6 py-8 md:px-12 md:py-10">
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
          className="w-full border-b border-strong bg-transparent pb-4 text-[1.4375rem] font-medium uppercase tracking-[-0.03em] outline-none placeholder:text-text-secondary md:text-[1.9375rem]"
        />

        {trimmed === '' && (
          <p className="body-text mt-8 text-text-secondary">
            Escribe para buscar entre nuestras piezas.
          </p>
        )}

        {trimmed !== '' && results.length === 0 && (
          <p className="body-text mt-8 text-text-secondary" role="status">
            No hay resultados para “{query}”. Prueba con otro término.
          </p>
        )}

        {results.length > 0 && (
          <ul className="mt-8 grid max-h-[50vh] grid-cols-2 gap-x-0 gap-y-8 overflow-y-auto md:grid-cols-4">
            {results.slice(0, 8).map((p) => (
              <li key={p.id}>
                <Link
                  to="/products/$slug"
                  params={{ slug: p.slug }}
                  onClick={onClose}
                  className="group block"
                >
                  <div className="overflow-hidden bg-subtle">
                    <img
                      src={p.images[0]}
                      alt={p.name}
                      className="aspect-3/4 w-full object-cover"
                    />
                  </div>
                  <div className="flex flex-col gap-1 px-5 pb-8 pt-3">
                    <p className="body-text transition-colors group-hover:text-text-secondary">
                      {p.name}
                    </p>
                    <p className="body-text text-text-secondary">
                      {formatCents(p.priceCents)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
