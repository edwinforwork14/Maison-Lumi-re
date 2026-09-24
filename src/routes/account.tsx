import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useStore } from '@/lib/store'
import { formatPrice } from '@/lib/format'
import { getSession, listMyOrders } from '@/features/commerce.api'
import { EmptyState } from '@/components/ui/EmptyState'

export const Route = createFileRoute('/account')({
  // Guard en servidor (plan §4.8): sin sesión no se entra, no hay if en UI.
  beforeLoad: async () => {
    const { user } = await getSession()
    if (!user) {
      throw redirect({ to: '/login' })
    }
    return { user }
  },
  head: () => ({ meta: [{ title: 'Mi cuenta — Maison Lumière' }] }),
  component: AccountPage,
})

function AccountPage() {
  const { user } = Route.useRouteContext()
  const { logout, wishlist } = useStore()

  const { data: orders = [] } = useQuery({
    queryKey: ['my-orders', user.email],
    queryFn: () => listMyOrders({ data: { email: user.email } }),
  })

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
          onClick={async () => {
            await logoutFnSafe()
            logout()
            window.location.href = '/'
          }}
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
          {orders.length === 0 ? (
            <>
              <p className="mb-6 text-sm text-taupe">
                Sus pedidos aparecerán aquí después de la primera compra.
              </p>
              <EmptyState
                title="Sin pedidos todavía"
                message="Descubra la nueva colección y realice su primer pedido."
                action={{ label: 'Ir a la tienda', linkProps: { to: '/shop' } }}
              />
            </>
          ) : (
            <ul className="divide-y divide-linen">
              {orders.map((order) => (
                <li key={order.number} className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm">{order.number}</p>
                      <p className="text-xs text-taupe">
                        {new Date(order.createdAt).toLocaleDateString('es-ES')} ·{' '}
                        {order.itemsCount}{' '}
                        {order.itemsCount === 1 ? 'pieza' : 'piezas'}
                      </p>
                    </div>
                    <span className="text-sm tabular-nums">
                      {formatPrice(order.total)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
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
              action={{ label: 'Explorar', linkProps: { to: '/shop' } }}
            />
          )}
        </section>
      </div>
    </div>
  )
}

async function logoutFnSafe(): Promise<void> {
  const { logoutFn } = await import('@/features/commerce.api')
  try {
    await logoutFn()
  } catch {
    // la sesión local se limpia igualmente
  }
}
