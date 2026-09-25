import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  adminListCoupons,
  adminSetCouponStatus,
  adminUpsertCoupon,
} from '@/features/admin/admin.api'
import { formatCents } from '@/lib/money-format'

/**
 * Cupones (Plan 02, §8 y G5).
 *
 * Estados obligatorios: carga, vacío, error y conflicto. El código es la
 * identidad del cupón (`UNIQUE(code)`), por eso un duplicado llega como
 * `CONFLICT` y se pinta en el formulario, no como un error genérico.
 */
export const Route = createFileRoute('/admin/coupons')({
  component: AdminCouponsPage,
})

const STATUS_LABEL: Record<string, string> = {
  active: 'Activo',
  paused: 'En pausa',
  expired: 'Caducado',
  archived: 'Archivado',
}

const KIND_LABEL: Record<string, string> = {
  percent: 'Porcentaje',
  fixed: 'Importe fijo',
  free_shipping: 'Envío gratuito',
}

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function AdminCouponsPage() {
  const queryClient = useQueryClient()
  const [notice, setNotice] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const coupons = useQuery({
    queryKey: ['admin', 'coupons'],
    queryFn: () => adminListCoupons({ data: { size: 50 } }),
  })

  const save = useMutation({
    mutationFn: (input: Parameters<typeof adminUpsertCoupon>[0]['data']) =>
      adminUpsertCoupon({ data: input }),
    onSuccess: (result) => {
      setNotice(result.created ? 'Cupón creado.' : 'Cupón actualizado.')
      setEditingId(null)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'coupons'] })
    },
    onError: (error: Error) => setNotice(error.message),
  })

  const changeStatus = useMutation({
    mutationFn: (input: { id: string; status: 'active' | 'paused' | 'expired' | 'archived' }) =>
      adminSetCouponStatus({ data: input }),
    onSuccess: () => {
      setNotice('Estado actualizado.')
      void queryClient.invalidateQueries({ queryKey: ['admin', 'coupons'] })
    },
    onError: (error: Error) => setNotice(error.message),
  })

  return (
    <div className="space-y-6">
      <h2 className="eyebrow">Cupones</h2>

      {notice && (
        <p role="status" className="border border-linen bg-sand px-4 py-2 text-xs">
          {notice}
        </p>
      )}

      {coupons.isPending ? (
        <div aria-busy="true" className="space-y-3">
          <p className="text-sm text-taupe">Cargando cupones…</p>
          <div className="skeleton h-16 w-full" />
        </div>
      ) : coupons.isError ? (
        <div role="alert" className="border border-linen p-6 text-sm text-taupe">
          No se pudieron cargar los cupones.
          <button
            type="button"
            onClick={() => coupons.refetch()}
            className="btn btn-outline ml-4 px-4 py-1 label"
          >
            Reintentar
          </button>
        </div>
      ) : coupons.data.items.length === 0 ? (
        <p className="border border-linen p-6 text-sm text-taupe">
          Todavía no hay cupones. Crea el primero abajo.
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Cupones de la tienda</caption>
          <thead>
            <tr className="border-b border-linen text-left">
              <th scope="col" className="py-2 pr-4 label text-taupe">Código</th>
              <th scope="col" className="py-2 pr-4 label text-taupe">Tipo</th>
              <th scope="col" className="py-2 pr-4 label text-taupe">Valor</th>
              <th scope="col" className="py-2 pr-4 label text-taupe">Usos</th>
              <th scope="col" className="py-2 pr-4 label text-taupe">Vigencia</th>
              <th scope="col" className="py-2 pr-4 label text-taupe">Estado</th>
              <th scope="col" className="py-2 label text-taupe">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {coupons.data.items.map((coupon) => (
              <tr key={coupon.id} className="border-b border-linen align-top">
                <td className="py-3 pr-4 font-medium">{coupon.code}</td>
                <td className="py-3 pr-4">{KIND_LABEL[coupon.kind] ?? coupon.kind}</td>
                <td className="py-3 pr-4 tabular-nums">
                  {coupon.kind === 'percent'
                    ? `${coupon.value} %`
                    : coupon.kind === 'fixed'
                      ? formatCents(coupon.value)
                      : 'Envío gratis'}
                </td>
                <td className="py-3 pr-4 tabular-nums">
                  {coupon.redemptionCount}
                  {coupon.maxUses === null ? '' : ` / ${coupon.maxUses}`}
                </td>
                <td className="py-3 pr-4 text-xs text-taupe">
                  {new Date(coupon.startsAt).toLocaleDateString('es-ES')}
                  {' → '}
                  {coupon.endsAt ? new Date(coupon.endsAt).toLocaleDateString('es-ES') : 'sin caducidad'}
                </td>
                <td className="py-3 pr-4">{STATUS_LABEL[coupon.status] ?? coupon.status}</td>
                <td className="py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingId(editingId === coupon.id ? null : coupon.id)}
                      aria-expanded={editingId === coupon.id}
                      className="btn btn-outline px-3 py-1 label"
                    >
                      {editingId === coupon.id ? 'Cerrar' : 'Editar'}
                    </button>
                    <button
                      type="button"
                      disabled={changeStatus.isPending || coupon.status === 'active'}
                      onClick={() => changeStatus.mutate({ id: coupon.id, status: 'active' })}
                      className="btn btn-outline px-3 py-1 label disabled:opacity-50"
                    >
                      Activar
                    </button>
                    <button
                      type="button"
                      disabled={changeStatus.isPending || coupon.status !== 'active'}
                      onClick={() => changeStatus.mutate({ id: coupon.id, status: 'paused' })}
                      className="btn btn-outline px-3 py-1 label disabled:opacity-50"
                    >
                      Pausar
                    </button>
                  </div>

                  {editingId === coupon.id && (
                    <CouponForm
                      initial={{
                        id: coupon.id,
                        code: coupon.code,
                        kind: coupon.kind,
                        value: coupon.value,
                        minSubtotalCents: coupon.minSubtotalCents,
                        maxUses: coupon.maxUses,
                        maxUsesPerCustomer: coupon.maxUsesPerCustomer,
                        startsAt: toLocalInput(coupon.startsAt.toISOString()),
                        endsAt: toLocalInput(coupon.endsAt?.toISOString() ?? null),
                        status: coupon.status,
                      }}
                      submitLabel="Guardar"
                      pending={save.isPending}
                      onSubmit={(input) => save.mutate(input)}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <section className="border-t border-linen pt-6">
        <h3 className="mb-4 eyebrow">Nuevo cupón</h3>
        <CouponForm
          submitLabel="Crear"
          pending={save.isPending}
          onSubmit={(input) => save.mutate(input)}
        />
      </section>
    </div>
  )
}

interface CouponFormValues {
  id?: string
  code: string
  kind: 'percent' | 'fixed' | 'free_shipping'
  value: number
  minSubtotalCents: number
  maxUses: number | null
  maxUsesPerCustomer: number | null
  startsAt: string
  endsAt: string
  status: 'active' | 'paused' | 'expired' | 'archived'
}

function CouponForm({
  initial,
  submitLabel,
  pending,
  onSubmit,
}: {
  initial?: CouponFormValues
  submitLabel: string
  pending: boolean
  onSubmit: (input: Parameters<typeof adminUpsertCoupon>[0]['data']) => void
}) {
  return (
    <form
      className="mt-3 grid gap-3 border border-linen p-4 sm:grid-cols-4"
      onSubmit={(event) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        const kind = String(form.get('kind') ?? 'percent') as CouponFormValues['kind']
        const startsAt = String(form.get('startsAt') ?? '')
        const endsAt = String(form.get('endsAt') ?? '')
        const maxUses = String(form.get('maxUses') ?? '').trim()
        const maxUsesPerCustomer = String(form.get('maxUsesPerCustomer') ?? '').trim()
        onSubmit({
          id: initial?.id,
          code: String(form.get('code') ?? ''),
          kind,
          value: Number(form.get('value') ?? 0),
          minSubtotalCents: Number(form.get('minSubtotalCents') ?? 0),
          maxUses: maxUses === '' ? null : Number(maxUses),
          maxUsesPerCustomer: maxUsesPerCustomer === '' ? null : Number(maxUsesPerCustomer),
          startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
          endsAt: endsAt ? new Date(endsAt).toISOString() : null,
          status: String(form.get('status') ?? 'active') as CouponFormValues['status'],
        })
        if (!initial?.id) event.currentTarget.reset()
      }}
    >
      <label>
        <span className="mb-1 block label text-taupe">Código</span>
        <input
          name="code"
          defaultValue={initial?.code ?? ''}
          pattern="[A-Za-z0-9_-]{3,40}"
          required
          className="field"
        />
      </label>
      <label>
        <span className="mb-1 block label text-taupe">Tipo</span>
        <select name="kind" defaultValue={initial?.kind ?? 'percent'} className="field">
          <option value="percent">Porcentaje</option>
          <option value="fixed">Importe fijo</option>
          <option value="free_shipping">Envío gratuito</option>
        </select>
      </label>
      <label>
        <span className="mb-1 block label text-taupe">Valor (% o céntimos)</span>
        <input
          name="value"
          type="number"
          min={0}
          step={1}
          defaultValue={initial?.value ?? 10}
          required
          className="field"
        />
      </label>
      <label>
        <span className="mb-1 block label text-taupe">Subtotal mínimo (céntimos)</span>
        <input
          name="minSubtotalCents"
          type="number"
          min={0}
          step={1}
          defaultValue={initial?.minSubtotalCents ?? 0}
          className="field"
        />
      </label>
      <label>
        <span className="mb-1 block label text-taupe">Usos totales (vacío = sin límite)</span>
        <input
          name="maxUses"
          type="number"
          min={1}
          step={1}
          defaultValue={initial?.maxUses ?? ''}
          className="field"
        />
      </label>
      <label>
        <span className="mb-1 block label text-taupe">Usos por cliente</span>
        <input
          name="maxUsesPerCustomer"
          type="number"
          min={1}
          step={1}
          defaultValue={initial?.maxUsesPerCustomer ?? ''}
          className="field"
        />
      </label>
      <label>
        <span className="mb-1 block label text-taupe">Inicio</span>
        <input name="startsAt" type="datetime-local" defaultValue={initial?.startsAt} className="field" />
      </label>
      <label>
        <span className="mb-1 block label text-taupe">Fin (vacío = sin caducidad)</span>
        <input name="endsAt" type="datetime-local" defaultValue={initial?.endsAt} className="field" />
      </label>
      <label>
        <span className="mb-1 block label text-taupe">Estado</span>
        <select name="status" defaultValue={initial?.status ?? 'active'} className="field">
          <option value="active">Activo</option>
          <option value="paused">En pausa</option>
          <option value="expired">Caducado</option>
          <option value="archived">Archivado</option>
        </select>
      </label>
      <div className="flex items-end sm:col-span-2">
        <button type="submit" disabled={pending} className="btn btn-solid px-6 py-3 label disabled:bg-clay">
          {pending ? 'Guardando…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
