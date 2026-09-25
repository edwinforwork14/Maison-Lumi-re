import { useState, type MouseEvent } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import type { Product } from '@/domain/catalog/types'
import { formatCents } from '@/lib/money-format'
import { useStore } from '@/lib/store'
import { useQuickView } from '@/features/quick-view/quick-view'
import { Badge } from '@/components/ui/Badge'

/**
 * Tarjeta de la referencia (Plan 04 §2.7): imagen 3/4 a sangre con fondo
 * `--subtle` y cross-fade a la segunda imagen (sin zoom, sin CTA flotante);
 * la información va debajo, siempre visible —nombre, precio y «Añadir a la
 * bolsa» (o «Agotado»)—. No hay corazón flotante (defecto U6): la wishlist
 * vive en su página y en la ficha.
 *
 * Navegación (brief overlay): el click abre la ficha como **overlay**
 * (quick-view) sin cambiar de ruta, así que el scroll y los filtros de la
 * PLP se conservan al cerrar. Ctrl/⌘/click central abren la ruta real
 * `/products/$slug` (pestaña nueva, SEO, compartir).
 *
 * «Añadir a la bolsa» usa el carrito del dominio (primer color, 1 ud): la
 * disponibilidad real la valida el servidor al cotizar (D18).
 */
export function ProductCard({ product }: { product: Product }) {
  const { addToCart } = useStore()
  const { openProduct } = useQuickView()
  const navigate = useNavigate()
  const [added, setAdded] = useState(false)
  const soldOut = product.stock === 0

  /** Overlay salvo modificadoras: esas piden la ruta real (pestaña nueva). */
  const openDetail = (e: MouseEvent) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) {
      void navigate({ to: '/products/$slug', params: { slug: product.slug } })
      return
    }
    e.preventDefault()
    openProduct(product.slug)
  }

  const handleAdd = () => {
    const color = product.colors[0]
    if (!color) return
    addToCart(product.id, color, 1)
    setAdded(true)
    window.setTimeout(() => setAdded(false), 1_500)
  }

  return (
    <div className="group relative">
      <Link
        to="/products/$slug"
        params={{ slug: product.slug }}
        onClick={openDetail}
        className="block overflow-hidden bg-subtle"
      >
        <figure className="relative aspect-3/4 w-full">
          <img
            src={product.images[0]}
            alt={product.name}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-opacity duration-[250ms] group-hover:opacity-0"
          />
          {product.images[1] && (
            <img
              src={product.images[1]}
              alt=""
              loading="lazy"
              aria-hidden
              className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-[250ms] group-hover:opacity-100"
            />
          )}
        </figure>
      </Link>

      {(product.isNew || product.bestseller || soldOut) && (
        <div className="absolute left-5 top-5 z-10 flex flex-col items-start gap-2">
          {soldOut && <Badge kind="out">Agotado</Badge>}
          {!soldOut && product.isNew && <Badge kind="new">Nuevo</Badge>}
          {!soldOut && product.bestseller && <Badge kind="bestseller">Bestseller</Badge>}
        </div>
      )}

      <div className="flex flex-col gap-3 px-5 pb-8 pt-3 text-[13px]">
        <Link
          to="/products/$slug"
          params={{ slug: product.slug }}
          onClick={openDetail}
          className="transition-colors duration-[250ms] hover:text-text-secondary"
        >
          {product.name}
        </Link>

        <div className="flex gap-2">
          <span>{formatCents(product.priceCents)}</span>
          {product.compareAtPriceCents && (
            <span className="text-text-secondary line-through">
              {formatCents(product.compareAtPriceCents)}
            </span>
          )}
        </div>

        {soldOut ? (
          <span
            aria-disabled="true"
            className="btn w-full border border-line-light text-text-secondary"
          >
            Agotado
          </span>
        ) : (
          <button
            type="button"
            onClick={handleAdd}
            className="self-start text-[13px] underline-offset-4 transition-colors duration-[250ms] hover:underline"
          >
            {added ? 'Añadido a tu cesta' : 'Añadir a la bolsa'}
          </button>
        )}
      </div>
    </div>
  )
}
