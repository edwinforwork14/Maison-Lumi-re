import { createFileRoute, Link } from '@tanstack/react-router'
import { useStore } from '@/lib/store'
import { formatPrice } from '@/lib/format'
import { QuantitySelector } from '@/components/ui/QuantitySelector'
import { CartSummary } from '@/components/cart/CartSummary'
import { EmptyState } from '@/components/ui/EmptyState'

export const Route = createFileRoute('/cart')({
  head: () => ({ meta: [{ title: 'Carrito — Maison Lumière' }] }),
  component: CartPage,
})

function CartPage() {
  const { cartTotals, updateQuantity, removeFromCart } = useStore()

  return (
    <div className="mx-auto max-w-7xl animate-fade-in px-4 py-14 md:px-8 md:py-20">
      <h1 className="mb-10 font-serif text-4xl font-light">Carrito</h1>

      {cartTotals.lines.length === 0 ? (
        <EmptyState
          title="Su carrito está vacío"
          message="Aún no ha añadido ninguna pieza. Descubra la nueva temporada."
          action={{ label: 'Descubrir la colección', linkProps: { to: '/shop' } }}
        />
      ) : (
        <div className="grid gap-12 lg:grid-cols-[1fr_360px]">
          <div>
            <ul className="divide-y divide-linen border-y border-linen">
              {cartTotals.lines.map((line) => (
                <li
                  key={`${line.product.id}-${line.color}`}
                  className="flex gap-6 py-8"
                >
                  <Link
                    to="/products/$slug"
                    params={{ slug: line.product.slug }}
                    className="shrink-0"
                  >
                    <img
                      src={line.product.images[0]}
                      alt={line.product.name}
                      className="h-40 w-30 object-cover"
                    />
                  </Link>
                  <div className="flex flex-1 flex-col justify-between">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <Link
                          to="/products/$slug"
                          params={{ slug: line.product.slug }}
                          className="text-sm hover:text-taupe"
                        >
                          {line.product.name}
                        </Link>
                        <p className="mt-1 text-xs text-taupe">
                          Color: {line.color}
                        </p>
                      </div>
                      <span className="text-sm tabular-nums">
                        {formatPrice(line.lineTotal)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <QuantitySelector
                        value={line.quantity}
                        onChange={(q) =>
                          updateQuantity(line.product.id, line.color, q)
                        }
                      />
                      <button
                        type="button"
                        onClick={() =>
                          removeFromCart(line.product.id, line.color)
                        }
                        className="text-[11px] uppercase tracking-[0.2em] text-taupe underline-offset-4 hover:text-ink hover:underline"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <Link
              to="/shop"
              className="mt-8 inline-block text-[11px] uppercase tracking-[0.2em] underline-offset-4 hover:underline"
            >
              ← Continuar comprando
            </Link>
          </div>

          <aside>
            <CartSummary
              totals={cartTotals}
              cta={
                <Link
                  to="/checkout"
                  className="block bg-ink py-4 text-center text-[11px] uppercase tracking-[0.25em] text-ivory transition-colors hover:bg-charcoal"
                >
                  Finalizar compra
                </Link>
              }
            />
          </aside>
        </div>
      )}
    </div>
  )
}
