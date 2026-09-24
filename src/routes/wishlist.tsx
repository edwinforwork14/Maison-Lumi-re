import { createFileRoute } from '@tanstack/react-router'
import { products } from '@/data/products'
import { useStore } from '@/lib/store'
import { ProductGrid } from '@/components/product/ProductGrid'
import { EmptyState } from '@/components/ui/EmptyState'

export const Route = createFileRoute('/wishlist')({
  head: () => ({ meta: [{ title: 'Wishlist — Maison Lumière' }] }),
  component: WishlistPage,
})

function WishlistPage() {
  const { wishlist } = useStore()
  const saved = products.filter((p) => wishlist.includes(p.id))

  return (
    <div className="mx-auto max-w-7xl animate-fade-in px-4 py-14 md:px-8 md:py-20">
      <h1 className="mb-10 font-serif text-4xl font-light">Wishlist</h1>
      {saved.length === 0 ? (
        <EmptyState
          title="Su wishlist está vacía"
          message="Guarde las piezas que le enamoren tocando el corazón de cada producto."
          action={{ label: 'Explorar el catálogo', to: '/shop' }}
        />
      ) : (
        <ProductGrid products={saved} />
      )}
    </div>
  )
}
