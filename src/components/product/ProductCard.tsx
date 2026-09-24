import { Link } from '@tanstack/react-router'
import type { Product } from '@/data/types'
import { formatCents } from '@/lib/money-format'
import { useStore } from '@/lib/store'
import { Badge } from '@/components/ui/Badge'

export function ProductCard({ product }: { product: Product }) {
  const { toggleWishlist, isWishlisted } = useStore()
  const wishlisted = isWishlisted(product.id)
  const soldOut = product.stock === 0

  return (
    <div className="group">
      <div className="relative overflow-hidden bg-sand">
        <Link to="/products/$slug" params={{ slug: product.slug }}>
          <img
            src={product.images[0]}
            alt={product.name}
            loading="lazy"
            className="aspect-3/4 w-full object-cover transition-opacity duration-700 group-hover:opacity-0"
          />
          {product.images[1] && (
            <img
              src={product.images[1]}
              alt=""
              loading="lazy"
              aria-hidden
              className="absolute inset-0 aspect-3/4 w-full object-cover opacity-0 transition-opacity duration-700 group-hover:opacity-100"
            />
          )}
        </Link>

        <div className="absolute left-4 top-4 flex flex-col gap-2">
          {product.isNew && !soldOut && <Badge kind="new">Nuevo</Badge>}
          {product.bestseller && !soldOut && (
            <Badge kind="bestseller">Bestseller</Badge>
          )}
          {product.compareAtPriceCents && !soldOut && (
            <Badge kind="sale">Edición limitada</Badge>
          )}
          {soldOut && <Badge kind="out">Agotado</Badge>}
        </div>

        <button
          type="button"
          onClick={() => toggleWishlist(product.id)}
          aria-label={wishlisted ? 'Quitar de wishlist' : 'Añadir a wishlist'}
          className={`absolute right-4 top-4 text-lg transition-all duration-300 ${
            wishlisted
              ? 'text-gold opacity-100'
              : 'text-charcoal/50 opacity-0 hover:text-charcoal group-hover:opacity-100 md:opacity-0 max-md:opacity-100'
          }`}
        >
          {wishlisted ? '♥' : '♡'}
        </button>

        {!soldOut && (
          <div className="absolute inset-x-4 bottom-4 translate-y-2 opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100 max-md:hidden">
            <Link
              to="/products/$slug"
              params={{ slug: product.slug }}
              className="block bg-ivory/95 py-3 text-center label backdrop-blur transition-colors hover:bg-ink hover:text-ivory"
            >
              Ver producto
            </Link>
          </div>
        )}
      </div>

      <div className="pt-4">
        <p className="mb-1 label-xs text-taupe">
          {product.colors.join(' · ')}
        </p>
        <Link
          to="/products/$slug"
          params={{ slug: product.slug }}
          className="text-sm hover:text-taupe"
        >
          {product.name}
        </Link>
        <p className="mt-1 flex items-baseline gap-2 text-sm">
          <span className={product.compareAtPriceCents ? 'text-gold' : ''}>
            {formatCents(product.priceCents)}
          </span>
          {product.compareAtPriceCents && (
            <span className="text-xs text-clay line-through">
              {formatCents(product.compareAtPriceCents)}
            </span>
          )}
        </p>
      </div>
    </div>
  )
}
