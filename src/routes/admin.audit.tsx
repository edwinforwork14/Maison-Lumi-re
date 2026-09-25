import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { adminListAuditLog } from '@/features/admin/admin.api'

/** Auditoría: tabla append-only, sólo lectura y con filtro por entidad. */
export const Route = createFileRoute('/admin/audit')({
  component: AdminAuditPage,
})

function AdminAuditPage() {
  const [entity, setEntity] = useState('')

  const entries = useQuery({
    queryKey: ['admin', 'audit', entity],
    queryFn: () => adminListAuditLog({ data: { entity: entity.trim() || undefined, limit: 50 } }),
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="eyebrow">Auditoría</h2>
        <label>
          <span className="mb-1 block label text-taupe">Entidad</span>
          <input
            value={entity}
            onChange={(event) => setEntity(event.target.value)}
            placeholder="products, inventory_items…"
            className="field"
          />
        </label>
      </div>

      {entries.isPending ? (
        <div aria-busy="true" className="space-y-3">
          <p className="text-sm text-taupe">Cargando el registro…</p>
          <div className="skeleton h-16 w-full" />
        </div>
      ) : entries.isError ? (
        <div role="alert" className="border border-linen p-6 text-sm text-taupe">
          No se pudo leer la auditoría. Puede que su rol no tenga el permiso{' '}
          <code>audit:read</code>.
          <button
            type="button"
            onClick={() => entries.refetch()}
            className="btn btn-outline ml-4 px-4 py-1 label"
          >
            Reintentar
          </button>
        </div>
      ) : entries.data.length === 0 ? (
        <p className="border border-linen p-6 text-sm text-taupe">
          No hay movimientos registrados con este filtro.
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Registro de auditoría</caption>
          <thead>
            <tr className="border-b border-linen text-left">
              <th scope="col" className="py-2 pr-4 label text-taupe">Fecha</th>
              <th scope="col" className="py-2 pr-4 label text-taupe">Acción</th>
              <th scope="col" className="py-2 pr-4 label text-taupe">Entidad</th>
              <th scope="col" className="py-2 pr-4 label text-taupe">Actor</th>
            </tr>
          </thead>
          <tbody>
            {entries.data.map((entry) => (
              <tr key={entry.id} className="border-b border-linen">
                <td className="py-2 pr-4 tabular-nums">
                  {new Date(entry.createdAt).toLocaleString('es-ES')}
                </td>
                <td className="py-2 pr-4">{entry.action}</td>
                <td className="py-2 pr-4">
                  {entry.entity}
                  {entry.entityId ? (
                    <span className="block text-xs text-taupe">{entry.entityId.slice(0, 8)}…</span>
                  ) : null}
                </td>
                <td className="py-2 pr-4 text-xs text-taupe">
                  {entry.actorKind}
                  {entry.actorId ? ` · ${entry.actorId.slice(0, 8)}…` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
