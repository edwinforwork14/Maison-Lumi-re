import { Link } from '@tanstack/react-router'
import { useStore } from '@/lib/store'
import { Drawer } from '@/components/ui/Drawer'
import { QuantitySelector } from '@/components/ui/QuantitySelector'
import { formatPrice } from '@/lib/format'

export function CartDrawer() {
  const { cartOpen, setCartOpen, cartTotals, updateQuantity, removeFromCart } =
    useStore()

  return (
    <Drawer
      open={cartOpen}
      onClose={() => setCartOpen(false)}
      title={`Carrito (${cartTotals.lines.reduce((n, l) => n + l.quantity, 0)})`}
    >
      {cartTotals.lines.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
          <p className="font-serif text-2xl font-light">Su carrito está vacío</p>
          <p className="text-sm text-taupe">
            Descubra las piezas de la nueva temporada.
          </p>
          <Link
            to="/shop"
            onClick={() => setCartOpen(false)}
            className="border border-ink px-8 py-3 text-[11px] uppercase tracking-[0.2em] transition-colors hover:bg-ink hover:text-ivory"
          >
            Descubrir
          </Link>
        </div>
      ) : (
        <>
          <ul className="flex-1 divide-y divide-linen overflow-y-auto px-6">
            {cartTotals.lines.map((line) => (
              <li key={`${line.product.id}-${line.color}`} className="flex gap-4 py-5">
                <img
                  src={line.product.images[0]}
                  alt={line.product.name}
                  className="h-28 w-20 shrink-0 object-cover"
                />
                <div className="flex flex-1 flex-col justify-between py-0.5">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        to="/products/$slug"
                        params={{ slug: line.product.slug }}
                        onClick={() => setCartOpen(false)}
                        className="text-sm hover:text-taupe"
                      >
                        {line.product.name}
                      </Link>
                      <button
                        type="button"
                        onClick={() =>
                          removeFromCart(line.product.id, line.color)
                        }
                        className="text-xs text-taupe hover:text-ink"
                        aria-label="Eliminar"
                      >
                        ✕
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-taupe">{line.color}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <QuantitySelector
                      value={line.quantity}
                      onChange={(q) =>
                        updateQuantity(line.product.id, line.color, q)
                      }
                    />
                    <span className="text-sm tabular-nums">
                      {formatPrice(line.lineTotal)}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <footer className="border-t border-linen px-6 py-5">
            <div className="mb-1 flex justify-between text-sm">
              <span>Subtotal</span>
              <span className="tabular-nums">
                {formatPrice(cartTotals.subtotal)}
              </span>
            </div>
            <div className="mb-4 flex justify-between text-xs text-taupe">
              <span>Envío estimado</span>
              <span>
                {cartTotals.shipping === 0
                  ? 'Gratuito'
                  : formatPrice(cartTotals.shipping)}
              </span>
            </div>
            <Link
              to="/checkout"
              onClick={() => setCartOpen(false)}
              className="block bg-ink py-4 text-center text-[11px] uppercase tracking-[0.25em] text-ivory transition-colors hover:bg-charcoal"
            >
              Finalizar compra
            </Link>
            <Link
              to="/cart"
              onClick={() => setCartOpen(false)}
              className="mt-3 block text-center text-[11px] uppercase tracking-[0.2em] text-taupe underline-offset-4 hover:underline"
            >
              Ver carrito
            </Link>
          </footer>
        </>
      )}
    </Drawer>
  )
}
