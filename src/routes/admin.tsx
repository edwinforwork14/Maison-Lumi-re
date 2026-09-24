import { createFileRoute, Link, Outlet, redirect, useNavigate } from '@tanstack/react-router'
import { adminLogout, adminSession } from '@/features/admin/admin.api'

/**
 * Shell del panel (Plan 02, G1). El guard vive aquí, una sola vez:
 * cualquier ruta `/admin/*` salvo el login exige sesión de administración
 * resuelta **en el servidor**; la cookie de tienda no sirve.
 *
 * Desviación declarada: el documento raíz (`__root.tsx`) sigue montando la
 * cabecera y el pie de la tienda, así que el panel los comparte. Extraer el
 * layout de tienda a `_storefront` es trabajo del Plan 03.
 */
export const Route = createFileRoute('/admin')({
  beforeLoad: async ({ location }) => {
    if (location.pathname === '/admin/login') {
      return { actor: null }
    }
    const state = await adminSession()
    if (!state.available || !state.actor) {
      throw redirect({ to: '/admin/login' })
    }
    return { actor: state.actor }
  },
  head: () => ({ meta: [{ title: 'Panel — Maison Lumière' }] }),
  component: AdminLayout,
})

const NAV = [
  { to: '/admin', label: 'Panel', exact: true },
  { to: '/admin/products', label: 'Productos', exact: false },
  { to: '/admin/orders', label: 'Pedidos', exact: false },
  { to: '/admin/customers', label: 'Clientes', exact: false },
  { to: '/admin/inventory', label: 'Inventario', exact: false },
  { to: '/admin/audit', label: 'Auditoría', exact: false },
] as const

function AdminLayout() {
  const navigate = useNavigate()
  const { actor } = Route.useRouteContext()

  // La página de login se pinta sola: no lleva navegación ni acciones.
  if (!actor) return <Outlet />

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 md:px-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-linen pb-6">
        <div>
          <p className="eyebrow mb-1">Administración</p>
          <h1 className="font-serif text-3xl font-light">Maison Lumière</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-taupe">
            {actor.permissions.length} permisos activos
          </span>
          <button
            type="button"
            className="btn btn-outline px-5 py-2 label"
            onClick={async () => {
              await adminLogout()
              await navigate({ to: '/admin/login' })
            }}
          >
            Salir
          </button>
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[200px_1fr]">
        <nav aria-label="Secciones del panel" className="lg:sticky lg:top-28 lg:self-start">
          <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
            {NAV.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  activeOptions={{ exact: item.exact }}
                  className="block px-3 py-2 label text-taupe transition-colors hover:text-ink"
                  activeProps={{ className: 'block px-3 py-2 label text-ink underline' }}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
