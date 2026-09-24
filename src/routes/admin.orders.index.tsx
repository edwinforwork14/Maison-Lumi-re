import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { adminListOrders } from '@/features/admin/admin.api'
import { formatMoney } from '@/lib/money-format'
import type { OrderStatus } from '@/domain/order/order'

/** Pedidos: listado filtrable por estado, búsqueda y rango de fechas. */
export const Route = createFileRoute('/admin/orders/')({
  component: AdminOrdersPage,
})

const STATUSES: ReadonlyArray<{ value: OrderStatus | ''; label: string }> = [
  { value: '', label: 'Todos' },
  { value: 'placed', label: 'Recibido' },
  { value: 'paid', label: 'Pagado' },
  { value: 'fulfilled', label: 'Enviado' },
  { value: 'cancelled', label: 'Cancelado' },
  { value: 'refunded', label: 'Reembolsado' },
]

function AdminOrdersPage() {
  const [status, setStatus] = useState<OrderStatus | ''>('')
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)

  const orders = useQuery({
    queryKey: ['admin', 'orders', { status, q, cursor }],
    queryFn: () =>
      adminListOrders({
        data: { status: status || undefined, q: q.trim() || undefined, cursor, size: 20 },
      }),
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <h2 className="eyebrow mr-auto">Pedidos</h2>
        <label>
          <span className="mb-1 block label text-taupe">Buscar</span>
          <input
            type="search"
            value={q}
            placeholder="Número o email"
            onChange={(event) => {
              setQ(event.target.value)
              setCursor(null)
            }}
            className="field"
          />
        </label>
        <label>
          <span className="mb-1 block label text-taupe">Estado</span>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as OrderStatus | '')
              setCursor(null)
            }}
            className="field"
          >
            {STATUSES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {orders.isPending ? (
        <div aria-busy="true" className="space-y-3">
          <p className="text-sm text-taupe">Cargando pedidos…</p>
          <div className="skeleton h-16 w-full" />
        </div>
      ) : orders.isError ? (
        <div role="alert" className="border border-linen p-6 text-sm text-taupe">
          No se pudieron cargar los pedidos. Puede que su rol no tenga el permiso{' '}
          <code>orders:read</code>.
          <button
            type="button"
            onClick={() => orders.refetch()}
            className="btn btn-outline ml-4 px-4 py-1 label"
          >
            Reintentar
          </button>
        </div>
      ) : orders.data.items.length === 0 ? (
        <p className="border border-linen p-6 text-sm text-taupe">
          No hay pedidos con este filtro.
        </p>
      ) : (
        <>
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Pedidos de la tienda</caption>
            <thead>
              <tr className="border-b border-linen text-left">
                <th scope="col" className="py-2 pr-4 label text-taupe">Número</th>
                <th scope="col" className="py-2 pr-4 label text-taupe">Cliente</th>
                <th scope="col" className="py-2 pr-4 label text-taupe">Fecha</th>
                <th scope="col" className="py-2 pr-4 label text-taupe">Estado</th>
                <th scope="col" className="py-2 pr-4 label text-taupe">Total</th>
                <th scope="col" className="py-2 label text-taupe">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {orders.data.items.map((order) => (
                <tr key={order.id} className="border-b border-linen">
                  <td className="py-3 pr-4">{order.number}</td>
                  <td className="py-3 pr-4 text-xs text-taupe">{order.email}</td>
                  <td className="py-3 pr-4 tabular-nums">
                    {order.placedAt
                      ? new Date(order.placedAt).toLocaleDateString('es-ES')
                      : '—'}
                  </td>
                  <td className="py-3 pr-4">{order.status}</td>
                  <td className="py-3 pr-4 tabular-nums">
                    {formatMoney({ amount: order.totalCents, currency: 'EUR' })}
                  </td>
                  <td className="py-3">
                    <Link
                      to="/admin/orders/$id"
                      params={{ id: order.id }}
                      className="label text-taupe underline-offset-4 hover:text-ink hover:underline"
                    >
                      Abrir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex items-center gap-4">
            <button
              type="button"
              disabled={!cursor}
              onClick={() => setCursor(null)}
              className="btn btn-outline px-4 py-2 label disabled:text-clay"
            >
              Primera página
            </button>
            <button
              type="button"
              disabled={!orders.data.hasMore}
              onClick={() => setCursor(orders.data.nextCursor)}
              className="btn btn-outline px-4 py-2 label disabled:text-clay"
            >
              Siguiente
            </button>
          </div>
        </>
      )}
    </div>
  )
}
