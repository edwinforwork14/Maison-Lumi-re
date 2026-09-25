import { Link } from '@tanstack/react-router'
import { useStore } from '@/lib/store'
import { Drawer } from '@/components/ui/Drawer'
import { QuantitySelector } from '@/components/ui/QuantitySelector'
import { useCartQuote } from '@/features/cart/use-cart-quote'
import { formatMoney } from '@/lib/money-format'
import { isZero } from '@/domain/money'

/**
 * Drawer del carrito. Los importes y la disponibilidad vienen de `quoteCart`
 * (servidor): aquí no se calcula ningún total (defecto D5) y la cantidad se
 * limita al stock real del SKU (defecto D18).
 */
export function CartDrawer() {
  const { cartOpen, setCartOpen, cartCount, updateQuantity, removeFromCart } =
    useStore()
  const { quote, isLoading, isError } = useCartQuote()

  return (
    <Drawer
      open={cartOpen}
      onClose={() => setCartOpen(false)}
      title={`Carrito (${cartCount})`}
    >
      {cartCount === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
          <p className="text-[1.0625rem] font-medium">Su carrito está vacío</p>
          <p className="text-sm text-text-secondary">
            Descubra las piezas de la nueva temporada.
          </p>
          <Link
            to="/shop"
            onClick={() => setCartOpen(false)}
            className="btn btn-outline px-8 py-3 label"
          >
            Descubrir
          </Link>
        </div>
      ) : isLoading ? (
        <div className="flex-1 space-y-4 px-6 py-5" aria-busy="true">
          <p className="eyebrow">Calculando su pedido…</p>
          <div className="skeleton h-28 w-full" />
          <div className="skeleton h-28 w-full" />
        </div>
      ) : isError || !quote ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-[1.0625rem] font-medium">
            No se pudo calcular su pedido
          </p>
          <p className="text-sm text-text-secondary">Vuelva a intentarlo en un momento.</p>
        </div>
      ) : (
        <>
          <ul className="flex-1 divide-y divide-line overflow-y-auto px-6">
            {quote.lines.map((line) => (
              <li key={line.variantId} className="flex gap-4 py-5">
                <img
                  src={line.image}
                  alt={line.name}
                  className="h-28 w-20 shrink-0 object-cover"
                />
                <div className="flex flex-1 flex-col justify-between py-0.5">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        to="/products/$slug"
                        params={{ slug: line.slug }}
                        onClick={() => setCartOpen(false)}
                        className="text-sm hover:text-text-secondary"
                      >
                        {line.name}
                      </Link>
                      <button
                        type="button"
                        onClick={() => removeFromCart(line.productId, line.color)}
                        className="text-xs text-text-secondary hover:text-strong"
                        aria-label={`Eliminar ${line.name}`}
                      >
                        ✕
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-text-secondary">{line.color}</p>
                    {line.availability === 'low' ? (
                      <p className="mt-1 text-xs text-text-secondary">
                        Últimas {line.availableStock} unidades
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-between">
                    <QuantitySelector
                      value={line.quantity}
                      max={line.availableStock}
                      onChange={(q) =>
                        updateQuantity(line.productId, line.color, q)
                      }
                    />
                    <span className="text-sm tabular-nums">
                      {formatMoney(line.lineTotal)}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <footer className="border-t border-line px-6 py-5">
            <div className="mb-1 flex justify-between text-sm">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatMoney(quote.subtotal)}</span>
            </div>
            <div className="mb-4 flex justify-between text-xs text-text-secondary">
              <span>Envío estimado</span>
              <span>
                {isZero(quote.shipping) ? 'Gratuito' : formatMoney(quote.shipping)}
              </span>
            </div>
            {!isZero(quote.freeShippingRemaining) ? (
              <p className="mb-4 text-xs text-text-secondary">
                {/* El umbral lo define `site_settings`; aquí sólo se pinta lo
                    que el servidor calcula (defecto D37). */}
                Envío gratuito: le faltan{' '}
                {formatMoney(quote.freeShippingRemaining)}
              </p>
            ) : null}
            <Link
              to="/checkout"
              onClick={() => setCartOpen(false)}
              className="btn btn-solid btn-block label"
            >
              Finalizar compra
            </Link>
            <Link
              to="/cart"
              onClick={() => setCartOpen(false)}
              className="mt-3 block text-center label text-text-secondary underline-offset-4 hover:underline"
            >
              Ver carrito
            </Link>
          </footer>
        </>
      )}
    </Drawer>
  )
}
