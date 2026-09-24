import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { listProductsByIds } from '@/features/commerce.api'
import { useStore } from '@/lib/store'
import { ProductGrid } from '@/components/product/ProductGrid'
import { EmptyState } from '@/components/ui/EmptyState'

export const Route = createFileRoute('/_storefront/wishlist')({
  head: () => ({ meta: [{ title: 'Wishlist — Maison Lumière' }] }),
  component: WishlistPage,
})

function WishlistPage() {
  const { wishlist } = useStore()

  const { data: saved = [] } = useQuery({
    queryKey: ['wishlist-products', wishlist],
    queryFn: () =>
      wishlist.length > 0
        ? listProductsByIds({ data: { ids: [...wishlist] } })
        : Promise.resolve([]),
    enabled: wishlist.length > 0,
  })

  return (
    <div className="mx-auto max-w-7xl animate-fade-in px-4 py-14 md:px-8 md:py-20">
      <h1 className="mb-10 font-serif text-4xl font-light">Wishlist</h1>
      {saved.length === 0 ? (
        <EmptyState
          title="Su wishlist está vacía"
          message="Guarde las piezas que le enamoren tocando el corazón de cada producto."
          action={{ label: 'Explorar el catálogo', linkProps: { to: '/shop' } }}
        />
      ) : (
        <ProductGrid products={saved} />
      )}
    </div>
  )
}
