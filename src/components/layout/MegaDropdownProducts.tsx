/**
 * Nivel 3 del mega dropdown (brief §4/§12): hasta 4 productos **reales** de
 * la sección/enlace activo —imagen, nombre, precio y link a la ficha—, nunca
 * imágenes falsas. Consulta con React Query compartida con la PLP y sólo
 * mientras el panel está abierto (§16); muestra skeleton mientras carga y un
 * estado discreto si la categoría no tiene piezas (§22).
 */

import { Link } from '@tanstack/react-router'
import { formatCents } from '@/lib/money-format'
import { cn } from '@/lib/cn'
import { useMegaProducts, type MegaFilters } from './mega-menu.data'

export interface MegaDropdownProductsProps {
  readonly filters: MegaFilters
  readonly open: boolean
  /** Click en una pieza: navega y cierra el panel (§15). */
  readonly onClose: () => void
  readonly className?: string
}

const MAX_ITEMS = 4

export function MegaDropdownProducts({
  filters,
  open,
  onClose,
  className,
}: MegaDropdownProductsProps) {
  const { products, isPending, isError } = useMegaProducts(filters, open)
  const shown = products.slice(0, MAX_ITEMS)

  return (
    <div className={className}>
      <p className="label-wide mb-5 text-text-secondary">Productos destacados</p>

      {isError ? (
        <p className="body-text text-text-secondary">
          No hemos podido cargar las piezas.
        </p>
      ) : isPending ? (
        <ul className="grid grid-cols-4 gap-3" aria-busy="true">
          {Array.from({ length: MAX_ITEMS }).map((_, i) => (
            <li key={i}>
              <div className="skeleton aspect-3/4 w-full" />
              <div className="skeleton mt-2 h-3 w-3/4" />
            </li>
          ))}
        </ul>
      ) : shown.length === 0 ? (
        <p className="body-text text-text-secondary">
          Todavía no hay piezas en esta selección.
        </p>
      ) : (
        <ul className="grid grid-cols-4 gap-3">
          {shown.map((p) => (
            <li key={p.id}>
              <Link
                to="/products/$slug"
                params={{ slug: p.slug }}
                onClick={onClose}
                className="group block"
              >
                <div className="overflow-hidden bg-subtle">
                  {p.images[0] && (
                    <img
                      src={p.images[0]}
                      alt={p.name}
                      loading="lazy"
                      className="aspect-3/4 w-full object-cover transition-transform duration-500 ease-[cubic-bezier(.23,1,.32,1)] group-hover:scale-[1.04]"
                    />
                  )}
                </div>
                <p
                  className={cn(
                    'body-text mt-2 transition-colors group-hover:text-text-secondary',
                  )}
                >
                  {p.name}
                </p>
                <p className="body-text text-text-secondary">
                  {formatCents(p.priceCents)}
                  {p.compareAtPriceCents != null && (
                    <s className="ml-2">{formatCents(p.compareAtPriceCents)}</s>
                  )}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
