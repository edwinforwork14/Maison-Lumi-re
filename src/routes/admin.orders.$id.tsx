import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  adminGetOrder,
  adminRefundOrder,
  adminUpdateOrderStatus,
} from '@/features/admin/admin.api'
import { formatMoney } from '@/lib/money-format'
import type { OrderStatus } from '@/domain/order/order'

/**
 * Detalle del pedido: líneas con snapshot, pagos, historial y las transiciones
 * que el **dominio** permite. La UI solo ofrece lo posible; si alguien fuerza
 * otra cosa, el servidor la rechaza igual.
 */
export const Route = createFileRoute('/admin/orders/$id')({
  component: AdminOrderDetailPage,
})

function AdminOrderDetailPage() {
  const { id } = Route.useParams()
  const queryClient = useQueryClient()
  const [notice, setNotice] = useState('')
  const [refundCents, setRefundCents] = useState('')
  const [reason, setReason] = useState('')

  const order = useQuery({
    queryKey: ['admin', 'order', id],
    queryFn: () => adminGetOrder({ data: { id } }),
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'order', id] })
    void queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] })
    void queryClient.invalidateQueries({ queryKey: ['admin', 'kpis'] })
  }

  const changeStatus = useMutation({
    mutationFn: (to: OrderStatus) => adminUpdateOrderStatus({ data: { id, to } }),
    onSuccess: (result) => {
      setNotice(`Estado actualizado: ${result.from} → ${result.to}.`)
      invalidate()
    },
    onError: (error: Error) => setNotice(error.message),
  })

  const refund = useMutation({
    mutationFn: (input: { amountCents: number; reason: string }) =>
      adminRefundOrder({ data: { id, ...input } }),
    onSuccess: (result) => {
      setNotice(
        `Reembolsados ${formatMoney({ amount: result.refundedCents, currency: 'EUR' })}. Estado: ${result.status}.`,
      )
      setRefundCents('')
      setReason('')
      invalidate()
    },
    onError: (error: Error) => setNotice(error.message),
  })

  if (order.isPending) {
    return (
      <div aria-busy="true" className="space-y-3">
        <p className="text-sm text-taupe">Cargando el pedido…</p>
        <div className="skeleton h-24 w-full" />
      </div>
    )
  }

  if (order.isError || !order.data) {
    return (
      <div role="alert" className="border border-linen p-6 text-sm text-taupe">
        No se pudo cargar el pedido.
        <button
          type="button"
          onClick={() => order.refetch()}
          className="btn btn-outline ml-4 px-4 py-1 label"
        >
          Reintentar
        </button>
      </div>
    )
  }

  const { order: summary, lines, payments, history, nextStatuses } = order.data

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to="/admin/orders"
            className="label text-taupe underline-offset-4 hover:underline"
          >
            ← Pedidos
          </Link>
          <h2 className="mt-2 font-serif text-2xl font-light">{summary.number}</h2>
          <p className="text-xs text-taupe">
            {summary.email} · {summary.status} ·{' '}
            {summary.placedAt ? new Date(summary.placedAt).toLocaleString('es-ES') : 'sin fecha'}
          </p>
        </div>
        <p className="font-serif text-2xl">{formatMoney(summary.totals.total)}</p>
      </div>

      {notice && (
        <p role="status" className="border border-linen bg-sand px-4 py-2 text-xs">
          {notice}
        </p>
      )}

      <section>
        <h3 className="mb-3 eyebrow">Líneas</h3>
        <ul className="divide-y divide-linen border-y border-linen">
          {lines.map((line) => (
            <li key={line.id} className="flex items-center justify-between py-3 text-sm">
              <span>
                {line.name} <span className="text-taupe">· {line.sku}</span>
              </span>
              <span className="tabular-nums">
                {line.quantity} × {formatMoney(line.unitPrice)} = {formatMoney(line.lineTotal)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        <div>
          <h3 className="mb-3 eyebrow">Importes</h3>
          <dl className="space-y-1 text-sm">
            <Row label="Subtotal" value={formatMoney(summary.totals.subtotal)} />
            <Row label="Descuento" value={`− ${formatMoney(summary.totals.discount)}`} />
            <Row label="Envío" value={formatMoney(summary.totals.shipping)} />
            <Row label="Impuestos" value={formatMoney(summary.totals.tax)} />
            <Row label="Total" value={formatMoney(summary.totals.total)} strong />
          </dl>
        </div>
        <div>
          <h3 className="mb-3 eyebrow">Pagos</h3>
          {payments.length === 0 ? (
            <p className="text-sm text-taupe">Sin pagos registrados.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {payments.map((payment) => (
                <li key={payment.id} className="flex justify-between">
                  <span>
                    {payment.provider} · {payment.status}
                  </span>
                  <span className="tabular-nums">
                    {formatMoney(payment.amount)}
                    {payment.refunded.amount > 0
                      ? ` (reembolsado ${formatMoney(payment.refunded)})`
                      : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section>
        <h3 className="mb-3 eyebrow">Cambiar estado</h3>
        {nextStatuses.length === 0 ? (
          <p className="text-sm text-taupe">
            Este pedido está en un estado final: no admite más transiciones.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {nextStatuses.map((status) => (
              <button
                key={status}
                type="button"
                disabled={changeStatus.isPending}
                onClick={() => changeStatus.mutate(status)}
                className="btn btn-outline px-4 py-2 label disabled:text-clay"
              >
                {status}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="border-t border-linen pt-6">
        <h3 className="mb-3 eyebrow">Reembolso</h3>
        <form
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault()
            refund.mutate({ amountCents: Math.round(Number(refundCents) * 100), reason })
          }}
        >
          <label>
            <span className="mb-1 block label text-taupe">Importe (€)</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={refundCents}
              onChange={(event) => setRefundCents(event.target.value)}
              className="field"
            />
          </label>
          <label className="sm:col-span-2">
            <span className="mb-1 block label text-taupe">Motivo</span>
            <input
              required
              minLength={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="field"
            />
          </label>
          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={refund.isPending}
              className="btn btn-solid px-6 py-3 label disabled:bg-clay"
            >
              {refund.isPending ? 'Procesando…' : 'Reembolsar'}
            </button>
          </div>
        </form>
      </section>

      <section>
        <h3 className="mb-3 eyebrow">Historial</h3>
        {history.length === 0 ? (
          <p className="text-sm text-taupe">Sin cambios de estado registrados.</p>
        ) : (
          <ol className="space-y-2 text-sm">
            {history.map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="flex justify-between">
                <span>
                  {entry.from ?? '—'} → {entry.to}
                  {entry.note ? <span className="text-taupe"> · {entry.note}</span> : null}
                </span>
                <span className="tabular-nums text-taupe">
                  {new Date(entry.at).toLocaleString('es-ES')}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className={strong ? 'uppercase tracking-[0.15em]' : ''}>{label}</dt>
      <dd className={`tabular-nums ${strong ? 'font-medium' : ''}`}>{value}</dd>
    </div>
  )
}
