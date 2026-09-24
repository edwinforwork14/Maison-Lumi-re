import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { adminListCustomers } from '@/features/admin/admin.api'
import { formatMoney } from '@/lib/money-format'

/**
 * Clientes. Con `customers:read` se ven métricas comerciales y el contacto
 * **enmascarado**; ver los datos personales exige `customers:pii` y queda
 * auditado (Plan 02 §5).
 */
export const Route = createFileRoute('/admin/customers')({
  component: AdminCustomersPage,
})

function AdminCustomersPage() {
  const [q, setQ] = useState('')

  const customers = useQuery({
    queryKey: ['admin', 'customers', q],
    queryFn: () => adminListCustomers({ data: { q: q.trim() || undefined, size: 50 } }),
  })

  const piiVisible = customers.data?.items[0]?.piiVisible ?? false

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="eyebrow">Clientes</h2>
        <label>
          <span className="mb-1 block label text-taupe">Buscar</span>
          <input
            type="search"
            value={q}
            placeholder="Email o apellido"
            onChange={(event) => setQ(event.target.value)}
            className="field"
          />
        </label>
      </div>

      <p className="text-xs text-taupe">
        {piiVisible
          ? 'Su rol incluye customers:pii: los datos de contacto se muestran y cada consulta queda auditada.'
          : 'Los datos de contacto aparecen enmascarados: su rol no incluye customers:pii.'}
      </p>

      {customers.isPending ? (
        <div aria-busy="true" className="space-y-3">
          <p className="text-sm text-taupe">Cargando clientes…</p>
          <div className="skeleton h-16 w-full" />
        </div>
      ) : customers.isError ? (
        <div role="alert" className="border border-linen p-6 text-sm text-taupe">
          No se pudieron cargar los clientes. Puede que su rol no tenga el permiso{' '}
          <code>customers:read</code>.
          <button
            type="button"
            onClick={() => customers.refetch()}
            className="btn btn-outline ml-4 px-4 py-1 label"
          >
            Reintentar
          </button>
        </div>
      ) : customers.data.items.length === 0 ? (
        <p className="border border-linen p-6 text-sm text-taupe">
          No hay clientes con este filtro.
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Clientes registrados</caption>
          <thead>
            <tr className="border-b border-linen text-left">
              <th scope="col" className="py-2 pr-4 label text-taupe">Cliente</th>
              <th scope="col" className="py-2 pr-4 label text-taupe">Contacto</th>
              <th scope="col" className="py-2 pr-4 label text-taupe">Pedidos</th>
              <th scope="col" className="py-2 pr-4 label text-taupe">Gastado</th>
              <th scope="col" className="py-2 label text-taupe">Última compra</th>
            </tr>
          </thead>
          <tbody>
            {customers.data.items.map((customer) => (
              <tr key={customer.id} className="border-b border-linen">
                <td className="py-3 pr-4">{customer.name}</td>
                <td className="py-3 pr-4 text-xs text-taupe">{customer.email}</td>
                <td className="py-3 pr-4 tabular-nums">{customer.orderCount}</td>
                <td className="py-3 pr-4 tabular-nums">
                  {formatMoney({ amount: customer.totalSpentCents, currency: 'EUR' })}
                </td>
                <td className="py-3 tabular-nums text-xs text-taupe">
                  {customer.lastOrderAt
                    ? new Date(customer.lastOrderAt).toLocaleDateString('es-ES')
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
