import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { listProductsByIds } from '@/features/commerce.api'
import { queryKeys } from '@/features/model/queries'
import { useWishlist } from '@/features/wishlist/use-wishlist'
import { ProductGrid } from '@/components/product/ProductGrid'
import { EmptyState } from '@/components/ui/EmptyState'

export const Route = createFileRoute('/_storefront/wishlist')({
  head: () => ({ meta: [{ title: 'Wishlist — Maison Lumière' }] }),
  component: WishlistPage,
})

/**
 * Wishlist. Con sesión, los ids vienen del servidor (Plan 03 S3); sin ella,
 * de la caché local. El estado de carga es explícito: «cargando» no es
 * «vacío» (defecto D35).
 */
function WishlistPage() {
  const wishlist = useWishlist()
  const hasItems = wishlist.ids.length > 0

  const products = useQuery({
    queryKey: queryKeys.wishlistProducts([...wishlist.ids]),
    queryFn: () => listProductsByIds({ data: { ids: [...wishlist.ids] } }),
    enabled: hasItems,
  })

  const loading = wishlist.isPending || (hasItems && products.isPending)
  const items = hasItems ? (products.data ?? []) : []

  return (
    <div className="mx-auto max-w-7xl animate-fade-in px-4 py-14 md:px-8 md:py-20">
      <h1 className="mb-10 editorial-title">Wishlist</h1>

      {loading ? (
        <div aria-busy="true" className="space-y-6">
          <p className="text-sm text-text-secondary">Cargando su wishlist…</p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="space-y-3">
                <div className="skeleton aspect-3/4 w-full" />
                <div className="skeleton h-4 w-2/3" />
              </div>
            ))}
          </div>
        </div>
      ) : products.isError ? (
        <div role="alert" className="border border-line p-6 text-sm text-text-secondary">
          No se pudieron cargar las piezas guardadas.
          <button
            type="button"
            onClick={() => products.refetch()}
            className="btn btn-outline ml-4 px-4 py-1 label"
          >
            Reintentar
          </button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="Su wishlist está vacía"
          message="Guarde las piezas que le enamoren tocando el corazón de cada producto."
          action={{ label: 'Explorar el catálogo', linkProps: { to: '/shop' } }}
        />
      ) : (
        <ProductGrid products={items} />
      )}
    </div>
  )
}
