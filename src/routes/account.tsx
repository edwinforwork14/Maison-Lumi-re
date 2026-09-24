import { createFileRoute, Link } from '@tanstack/react-router'
import { useStore } from '@/lib/store'
import { EmptyState } from '@/components/ui/EmptyState'

export const Route = createFileRoute('/account')({
  head: () => ({ meta: [{ title: 'Mi cuenta — Maison Lumière' }] }),
  component: AccountPage,
})

function AccountPage() {
  const { user, logout, wishlist } = useStore()

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="mb-4 font-serif text-3xl font-light">Mi cuenta</h1>
        <p className="mb-10 text-sm text-taupe">
          Inicie sesión para acceder a su cuenta, pedidos y wishlist.
        </p>
        <div className="flex justify-center gap-4">
          <Link
            to="/login"
            className="bg-ink px-8 py-3 text-[11px] uppercase tracking-[0.2em] text-ivory transition-colors hover:bg-charcoal"
          >
            Iniciar sesión
          </Link>
          <Link
            to="/register"
            className="border border-ink px-8 py-3 text-[11px] uppercase tracking-[0.2em] transition-colors hover:bg-ink hover:text-ivory"
          >
            Crear cuenta
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl animate-fade-in px-4 py-14 md:px-8 md:py-20">
      <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-[11px] uppercase tracking-[0.3em] text-taupe">
            Mi cuenta
          </p>
          <h1 className="font-serif text-4xl font-light">
            {user.firstName} {user.lastName}
          </h1>
          <p className="mt-1 text-sm text-taupe">{user.email}</p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="text-[11px] uppercase tracking-[0.2em] text-taupe underline-offset-4 hover:text-ink hover:underline"
        >
          Cerrar sesión
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="border border-linen p-8">
          <h2 className="mb-3 text-[11px] uppercase tracking-[0.25em] text-taupe">
            Pedidos
          </h2>
          <p className="mb-6 text-sm text-taupe">
            Sus pedidos aparecerán aquí después de la primera compra. (Los
            pedidos de esta demo no se guardan entre sesiones.)
          </p>
          <EmptyState
            title="Sin pedidos todavía"
            message="Descubra la nueva colección y realice su primer pedido."
            action={{ label: 'Ir a la tienda', to: '/shop' }}
          />
        </section>

        <section className="border border-linen p-8">
          <h2 className="mb-3 text-[11px] uppercase tracking-[0.25em] text-taupe">
            Wishlist
          </h2>
          {wishlist.length > 0 ? (
            <>
              <p className="mb-6 text-sm text-taupe">
                Tiene {wishlist.length}{' '}
                {wishlist.length === 1 ? 'pieza guardada' : 'piezas guardadas'}.
              </p>
              <Link
                to="/wishlist"
                className="inline-block border border-ink px-6 py-3 text-[11px] uppercase tracking-[0.2em] transition-colors hover:bg-ink hover:text-ivory"
              >
                Ver wishlist
              </Link>
            </>
          ) : (
            <EmptyState
              title="Wishlist vacía"
              message="Guarde sus piezas favoritas tocando el corazón en cada producto."
              action={{ label: 'Explorar', to: '/shop' }}
            />
          )}
        </section>
      </div>
    </div>
  )
}
