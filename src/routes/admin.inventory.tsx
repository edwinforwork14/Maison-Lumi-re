import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  adminAdjustInventory,
  adminListInventory,
  type AdminInventoryRow,
} from '@/features/admin/admin.api'

/** Inventario: estado por SKU y ajustes con motivo (el ledger es obligatorio). */
export const Route = createFileRoute('/admin/inventory')({
  component: AdminInventoryPage,
})

const STATE_LABEL: Record<AdminInventoryRow['state'], string> = {
  ok: 'Disponible',
  low: 'Stock bajo',
  out: 'Agotado',
}

function AdminInventoryPage() {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all')
  const [notice, setNotice] = useState('')
  const [openVariant, setOpenVariant] = useState<string | null>(null)

  const inventory = useQuery({
    queryKey: ['admin', 'inventory', filter],
    queryFn: () => adminListInventory({ data: { filter, size: 50 } }),
  })

  const adjust = useMutation({
    mutationFn: (input: {
      variantId: string
      delta: number
      reason: 'purchase' | 'return' | 'adjustment' | 'correction'
      note?: string
    }) => adminAdjustInventory({ data: input }),
    onSuccess: (row) => {
      setNotice(`Stock de ${row.sku} actualizado a ${row.onHand} unidades.`)
      setOpenVariant(null)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'inventory'] })
      void queryClient.invalidateQueries({ queryKey: ['admin', 'kpis'] })
    },
    onError: (error: Error) => setNotice(error.message),
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="eyebrow">Inventario</h2>
        <label>
          <span className="mb-1 block label text-taupe">Filtro</span>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as typeof filter)}
            className="field"
          >
            <option value="all">Todo</option>
            <option value="low">Stock bajo</option>
            <option value="out">Agotado</option>
          </select>
        </label>
      </div>

      {notice && (
        <p role="status" className="border border-linen bg-sand px-4 py-2 text-xs">
          {notice}
        </p>
      )}

      {inventory.isPending ? (
        <div aria-busy="true" className="space-y-3">
          <p className="text-sm text-taupe">Cargando inventario…</p>
          <div className="skeleton h-16 w-full" />
        </div>
      ) : inventory.isError ? (
        <div role="alert" className="border border-linen p-6 text-sm text-taupe">
          No se pudo cargar el inventario.
          <button
            type="button"
            onClick={() => inventory.refetch()}
            className="btn btn-outline ml-4 px-4 py-1 label"
          >
            Reintentar
          </button>
        </div>
      ) : inventory.data.items.length === 0 ? (
        <p className="border border-linen p-6 text-sm text-taupe">
          No hay variantes con este filtro.
        </p>
      ) : (
        <ul className="divide-y divide-linen border-y border-linen">
          {inventory.data.items.map((row) => (
            <li key={row.variantId} className="py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm">
                    {row.productName} <span className="text-taupe">· {row.sku}</span>
                  </p>
                  <p className="text-xs text-taupe">
                    {row.color}
                    {row.size ? ` · ${row.size}` : ''} · reservado {row.reserved}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm tabular-nums">{row.onHand} uds.</span>
                  <span
                    className={`label ${row.state === 'ok' ? 'text-taupe' : 'text-gold'}`}
                  >
                    {STATE_LABEL[row.state]}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setOpenVariant(openVariant === row.variantId ? null : row.variantId)
                    }
                    aria-expanded={openVariant === row.variantId}
                    className="btn btn-outline px-4 py-2 label"
                  >
                    Ajustar
                  </button>
                </div>
              </div>

              {openVariant === row.variantId && (
                <form
                  className="mt-4 grid gap-3 border border-linen p-4 sm:grid-cols-4"
                  onSubmit={(event) => {
                    event.preventDefault()
                    const form = new FormData(event.currentTarget)
                    adjust.mutate({
                      variantId: row.variantId,
                      delta: Number(form.get('delta')),
                      reason: String(form.get('reason')) as 'purchase',
                      note: String(form.get('note') ?? '') || undefined,
                    })
                  }}
                >
                  <label>
                    <span className="mb-1 block label text-taupe">Cantidad (+/-)</span>
                    <input name="delta" type="number" required className="field" />
                  </label>
                  <label>
                    <span className="mb-1 block label text-taupe">Motivo</span>
                    <select name="reason" className="field" defaultValue="purchase">
                      <option value="purchase">Entrada</option>
                      <option value="return">Devolución</option>
                      <option value="correction">Corrección</option>
                      <option value="adjustment">Ajuste manual</option>
                    </select>
                  </label>
                  <label className="sm:col-span-2">
                    <span className="mb-1 block label text-taupe">
                      Nota (obligatoria en ajuste manual)
                    </span>
                    <input name="note" className="field" />
                  </label>
                  <div className="sm:col-span-4">
                    <button
                      type="submit"
                      disabled={adjust.isPending}
                      className="btn btn-solid px-6 py-3 label disabled:bg-clay"
                    >
                      {adjust.isPending ? 'Guardando…' : 'Aplicar ajuste'}
                    </button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
