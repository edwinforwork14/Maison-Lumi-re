import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { adminListReviews, adminModerateReview } from '@/features/admin/admin.api'

/**
 * Reseñas (Plan 02, §8 y G5).
 *
 * Sólo `approved` se publica en la tienda; por eso el listado arranca en
 * «Pendientes» y cada decisión (aprobar/rechazar) queda auditada con autor y
 * momento. La nota del moderador no se muestra en la reseña pública: viaja a
 * `audit_logs`.
 */
export const Route = createFileRoute('/admin/reviews')({
  component: AdminReviewsPage,
})

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
}

type Filter = 'pending' | 'approved' | 'rejected' | undefined

function AdminReviewsPage() {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<Filter>('pending')
  const [notice, setNotice] = useState('')

  const reviews = useQuery({
    queryKey: ['admin', 'reviews', filter],
    queryFn: () => adminListReviews({ data: { status: filter, size: 50 } }),
  })

  const moderate = useMutation({
    mutationFn: (input: { id: string; status: 'approved' | 'rejected'; note?: string }) =>
      adminModerateReview({ data: input }),
    onSuccess: (result) => {
      setNotice(result.status === 'approved' ? 'Reseña aprobada.' : 'Reseña rechazada.')
      void queryClient.invalidateQueries({ queryKey: ['admin', 'reviews'] })
    },
    onError: (error: Error) => setNotice(error.message),
  })

  const tabs: Array<{ key: Filter; label: string }> = [
    { key: 'pending', label: 'Pendientes' },
    { key: 'approved', label: 'Aprobadas' },
    { key: 'rejected', label: 'Rechazadas' },
    { key: undefined, label: 'Todas' },
  ]

  return (
    <div className="space-y-6">
      <h2 className="eyebrow">Reseñas</h2>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrar reseñas">
        {tabs.map((tab) => (
          <button
            key={tab.label}
            type="button"
            role="tab"
            aria-selected={filter === tab.key}
            onClick={() => setFilter(tab.key)}
            className={`btn px-4 py-2 label ${filter === tab.key ? 'btn-solid' : 'btn-outline'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {notice && (
        <p role="status" className="border border-linen bg-sand px-4 py-2 text-xs">
          {notice}
        </p>
      )}

      {reviews.isPending ? (
        <div aria-busy="true" className="space-y-3">
          <p className="text-sm text-taupe">Cargando reseñas…</p>
          <div className="skeleton h-16 w-full" />
        </div>
      ) : reviews.isError ? (
        <div role="alert" className="border border-linen p-6 text-sm text-taupe">
          No se pudieron cargar las reseñas.
          <button
            type="button"
            onClick={() => reviews.refetch()}
            className="btn btn-outline ml-4 px-4 py-1 label"
          >
            Reintentar
          </button>
        </div>
      ) : reviews.data.items.length === 0 ? (
        <p className="border border-linen p-6 text-sm text-taupe">No hay reseñas con este filtro.</p>
      ) : (
        <ul className="space-y-4">
          {reviews.data.items.map((review) => (
            <li key={review.id} className="border border-linen p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{review.productName}</p>
                  <p className="text-xs text-taupe">
                    {'★'.repeat(review.rating)}
                    {'☆'.repeat(5 - review.rating)} ·{' '}
                    <time dateTime={review.createdAt.toISOString()}>
                      {new Date(review.createdAt).toLocaleDateString('es-ES')}
                    </time>{' '}
                    · {STATUS_LABEL[review.status] ?? review.status}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={moderate.isPending || review.status === 'approved'}
                    onClick={() => moderate.mutate({ id: review.id, status: 'approved' })}
                    className="btn btn-outline px-4 py-2 label disabled:opacity-50"
                  >
                    Aprobar
                  </button>
                  <button
                    type="button"
                    disabled={moderate.isPending || review.status === 'rejected'}
                    onClick={() => {
                      const note = window.prompt('Motivo del rechazo (opcional):')
                      if (note === null) return
                      moderate.mutate({ id: review.id, status: 'rejected', note: note || undefined })
                    }}
                    className="btn btn-outline px-4 py-2 label disabled:opacity-50"
                  >
                    Rechazar
                  </button>
                </div>
              </div>
              {review.title && <p className="mb-1 text-sm">{review.title}</p>}
              {review.body && <p className="text-sm text-taupe">{review.body}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
