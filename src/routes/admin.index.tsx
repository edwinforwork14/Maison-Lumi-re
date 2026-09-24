import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { adminDashboardKpis } from '@/features/admin/admin.api'
import { formatMoney } from '@/lib/money-format'

/** Panel: KPIs calculados con SQL real, nunca números duros (Plan 02 §7). */
export const Route = createFileRoute('/admin/')({
  component: AdminDashboardPage,
})

function AdminDashboardPage() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['admin', 'kpis', 30],
    queryFn: () => adminDashboardKpis({ data: { days: 30 } }),
  })

  if (isPending) {
    return (
      <div aria-busy="true" className="space-y-4">
        <p className="eyebrow">Calculando indicadores…</p>
        <div className="skeleton h-24 w-full" />
        <div className="skeleton h-40 w-full" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div role="alert" className="border border-linen p-8">
        <p className="mb-4 text-sm text-taupe">
          No se pudieron cargar los indicadores. Compruebe la conexión de datos del panel.
        </p>
        <button type="button" onClick={() => refetch()} className="btn btn-outline px-6 py-2 label">
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-4 eyebrow">Últimos 30 días</h2>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Ventas" value={formatMoney(data.sales)} />
          <Metric label="Pedidos" value={String(data.orderCount)} />
          <Metric label="Ticket medio" value={formatMoney(data.averageOrderValue)} />
          <Metric
            label="Stock bajo / agotado"
            value={`${data.stockAlerts.low} / ${data.stockAlerts.out}`}
          />
        </dl>
      </section>

      <section>
        <h2 className="mb-4 eyebrow">Más vendidos</h2>
        {data.topProducts.length === 0 ? (
          <p className="text-sm text-taupe">Todavía no hay ventas en este periodo.</p>
        ) : (
          <ul className="divide-y divide-linen border-y border-linen">
            {data.topProducts.map((product) => (
              <li key={product.variantId} className="flex items-center justify-between py-3 text-sm">
                <span>
                  {product.name} <span className="text-taupe">· {product.sku}</span>
                </span>
                <span className="tabular-nums">{product.unitsSold} uds.</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="eyebrow">Últimos pedidos</h2>
          <Link to="/admin/inventory" className="label text-taupe underline-offset-4 hover:underline">
            Ver inventario
          </Link>
        </div>
        {data.recentOrders.length === 0 ? (
          <p className="text-sm text-taupe">Sin pedidos registrados.</p>
        ) : (
          <ul className="divide-y divide-linen border-y border-linen">
            {data.recentOrders.map((order) => (
              <li key={order.number} className="flex items-center justify-between py-3 text-sm">
                <span>
                  {order.number} <span className="text-taupe">· {order.status}</span>
                </span>
                <span className="tabular-nums">
                  {formatMoney({ amount: order.totalCents, currency: 'EUR' })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-linen p-5">
      <dt className="label text-taupe">{label}</dt>
      <dd className="mt-2 font-serif text-2xl">{value}</dd>
    </div>
  )
}
