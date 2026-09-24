import { createFileRoute, Link } from '@tanstack/react-router'
import { useStore } from '@/lib/store'
import { useCartQuote } from '@/features/cart/use-cart-quote'
import { formatMoney } from '@/lib/money-format'
import { QuantitySelector } from '@/components/ui/QuantitySelector'
import { CartSummary } from '@/components/cart/CartSummary'
import { EmptyState } from '@/components/ui/EmptyState'

export const Route = createFileRoute('/_storefront/cart')({
  head: () => ({ meta: [{ title: 'Carrito — Maison Lumière' }] }),
  component: CartPage,
})

/**
 * Página de carrito. Sólo pinta la cotización del servidor: precios, envío,
 * disponibilidad y total vienen de `quoteCart` (defecto D5). La cantidad se
 * limita al stock real del SKU (defecto D18).
 */
function CartPage() {
  const { cartCount, updateQuantity, removeFromCart } = useStore()
  const { quote, isLoading, isError, refetch } = useCartQuote()

  return (
    <div className="mx-auto max-w-7xl animate-fade-in px-4 py-14 md:px-8 md:py-20">
      <h1 className="mb-10 font-serif text-4xl font-light">Carrito</h1>

      {cartCount === 0 ? (
        <EmptyState
          title="Su carrito está vacío"
          message="Aún no ha añadido ninguna pieza. Descubra la nueva temporada."
          action={{ label: 'Descubrir la colección', linkProps: { to: '/shop' } }}
        />
      ) : isLoading ? (
        <div aria-busy="true" className="space-y-6">
          <p className="eyebrow">Calculando su pedido…</p>
          <div className="skeleton h-40 w-full" />
          <div className="skeleton h-40 w-full" />
        </div>
      ) : isError || !quote ? (
        <EmptyState
          title="No se pudo calcular su pedido"
          message="Ha ocurrido un problema al consultar precios y disponibilidad. Vuelva a intentarlo."
          action={{ label: 'Reintentar', onClick: refetch }}
        />
      ) : (
        <div className="grid gap-12 lg:grid-cols-[1fr_360px]">
          <div>
            <ul className="divide-y divide-linen border-y border-linen">
              {quote.lines.map((line) => (
                <li key={line.variantId} className="flex gap-6 py-8">
                  <Link
                    to="/products/$slug"
                    params={{ slug: line.slug }}
                    className="shrink-0"
                  >
                    <img
                      src={line.image}
                      alt={line.name}
                      className="h-40 w-30 object-cover"
                    />
                  </Link>
                  <div className="flex flex-1 flex-col justify-between">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <Link
                          to="/products/$slug"
                          params={{ slug: line.slug }}
                          className="text-sm hover:text-taupe"
                        >
                          {line.name}
                        </Link>
                        <p className="mt-1 text-xs text-taupe">Color: {line.color}</p>
                        {line.availability === 'low' ? (
                          <p className="mt-1 text-xs text-clay">
                            Últimas {line.availableStock} unidades
                          </p>
                        ) : null}
                      </div>
                      <span className="text-sm tabular-nums">
                        {formatMoney(line.lineTotal)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <QuantitySelector
                        value={line.quantity}
                        max={line.availableStock}
                        onChange={(q) => updateQuantity(line.productId, line.color, q)}
                      />
                      <button
                        type="button"
                        onClick={() => removeFromCart(line.productId, line.color)}
                        className="label text-taupe underline-offset-4 hover:text-ink hover:underline"
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
              className="mt-8 inline-block label underline-offset-4 hover:underline"
            >
              ← Continuar comprando
            </Link>
          </div>

          <aside>
            <CartSummary
              totals={quote}
              cta={
                <Link to="/checkout" className="btn btn-solid btn-block label">
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
