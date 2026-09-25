import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { adminListContent, adminUpsertBanner, adminUpsertHomepageSection } from '@/features/admin/admin.api'
import { queryKeys } from '@/features/model/queries'

/** Contenido de portada: secciones y banners, editables desde el panel. */
export const Route = createFileRoute('/admin/content')({
  component: AdminContentPage,
})

function AdminContentPage() {
  const queryClient = useQueryClient()
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<string | null>(null)

  const content = useQuery({
    queryKey: ['admin', 'content'],
    queryFn: () => adminListContent(),
  })

  const save = useMutation({
    mutationFn: (input: {
      kind: 'section' | 'banner'
      id?: string
      key: string
      title?: string | null
      subtitle?: string | null
      ctaLabel?: string | null
      ctaHref?: string | null
      placement?: 'home' | 'home_hero' | 'shop' | 'checkout'
      position?: number
      status?: 'draft' | 'published' | 'archived'
    }) => {
      const { kind, ...rest } = input
      // Cada tipo de contenido tiene su server function congelada (Plan 02 §4).
      return kind === 'section'
        ? adminUpsertHomepageSection({ data: rest })
        : adminUpsertBanner({ data: rest })
    },
    onSuccess: (result) => {
      setNotice(result.created ? 'Contenido creado.' : 'Contenido actualizado.')
      setEditing(null)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'content'] })
      // La portada lee esto: su caché queda obsoleta.
      void queryClient.invalidateQueries({ queryKey: queryKeys.content() })
    },
    onError: (error: Error) => setNotice(error.message),
  })

  return (
    <div className="space-y-6">
      <h2 className="eyebrow">Contenido</h2>

      {notice && (
        <p role="status" className="border border-linen bg-sand px-4 py-2 text-xs">
          {notice}
        </p>
      )}

      {content.isPending ? (
        <div aria-busy="true" className="space-y-3">
          <p className="text-sm text-taupe">Cargando contenido…</p>
          <div className="skeleton h-16 w-full" />
        </div>
      ) : content.isError ? (
        <div role="alert" className="border border-linen p-6 text-sm text-taupe">
          No se pudo cargar el contenido.
          <button
            type="button"
            onClick={() => content.refetch()}
            className="btn btn-outline ml-4 px-4 py-1 label"
          >
            Reintentar
          </button>
        </div>
      ) : content.data.length === 0 ? (
        <p className="border border-linen p-6 text-sm text-taupe">
          Todavía no hay secciones ni banners.
        </p>
      ) : (
        <ul className="divide-y divide-linen border-y border-linen">
          {content.data.map((row) => (
            <li key={`${row.kind}-${row.id}`} className="py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm">
                    {row.title ?? '(sin título)'}{' '}
                    <span className="text-xs text-taupe">
                      · {row.kind} · {row.key} · {row.placement} · pos {row.position} · {row.status}
                    </span>
                  </p>
                  {row.ctaLabel ? (
                    <p className="text-xs text-taupe">
                      CTA: {row.ctaLabel} → {row.ctaHref ?? '—'}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(editing === row.id ? null : row.id)}
                  aria-expanded={editing === row.id}
                  className="btn btn-outline px-4 py-2 label"
                >
                  {editing === row.id ? 'Cerrar' : 'Editar'}
                </button>
              </div>

              {editing === row.id && (
                <form
                  className="mt-3 grid gap-2 border border-linen p-4 sm:grid-cols-4"
                  onSubmit={(event) => {
                    event.preventDefault()
                    const form = new FormData(event.currentTarget)
                    save.mutate({
                      kind: row.kind,
                      id: row.id,
                      key: row.key,
                      title: String(form.get('title') ?? ''),
                      subtitle: String(form.get('subtitle') ?? ''),
                      ctaLabel: String(form.get('ctaLabel') ?? ''),
                      ctaHref: String(form.get('ctaHref') ?? '') || undefined,
                      position: Number(form.get('position') ?? row.position),
                      status: String(form.get('status') ?? row.status) as 'draft',
                    })
                  }}
                >
                  <label className="sm:col-span-2">
                    <span className="mb-1 block label text-taupe">Título</span>
                    <input name="title" defaultValue={row.title ?? ''} className="field" />
                  </label>
                  <label className="sm:col-span-2">
                    <span className="mb-1 block label text-taupe">Subtítulo</span>
                    <input name="subtitle" defaultValue={row.subtitle ?? ''} className="field" />
                  </label>
                  <label>
                    <span className="mb-1 block label text-taupe">Texto del CTA</span>
                    <input name="ctaLabel" defaultValue={row.ctaLabel ?? ''} className="field" />
                  </label>
                  <label>
                    <span className="mb-1 block label text-taupe">Enlace del CTA</span>
                    <input
                      name="ctaHref"
                      defaultValue={row.ctaHref ?? ''}
                      placeholder="/shop"
                      className="field"
                    />
                  </label>
                  <label>
                    <span className="mb-1 block label text-taupe">Posición</span>
                    <input
                      name="position"
                      type="number"
                      min="0"
                      defaultValue={row.position}
                      className="field"
                    />
                  </label>
                  <label>
                    <span className="mb-1 block label text-taupe">Estado</span>
                    <select name="status" defaultValue={row.status} className="field">
                      <option value="draft">Borrador</option>
                      <option value="published">Publicado</option>
                      <option value="archived">Archivado</option>
                    </select>
                  </label>
                  <div className="sm:col-span-4">
                    <button
                      type="submit"
                      disabled={save.isPending}
                      className="btn btn-solid px-6 py-3 label disabled:bg-clay"
                    >
                      {save.isPending ? 'Guardando…' : 'Guardar'}
                    </button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      <section className="border-t border-linen pt-6">
        <h3 className="mb-4 eyebrow">Nuevo contenido</h3>
        <form
          className="grid gap-3 sm:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            save.mutate({
              kind: String(form.get('kind')) as 'section',
              key: String(form.get('key') ?? ''),
              title: String(form.get('title') ?? ''),
              ctaLabel: String(form.get('ctaLabel') ?? '') || undefined,
              ctaHref: String(form.get('ctaHref') ?? '') || undefined,
              status: 'draft',
            })
            event.currentTarget.reset()
          }}
        >
          <label>
            <span className="mb-1 block label text-taupe">Tipo</span>
            <select name="kind" className="field" defaultValue="section">
              <option value="section">Sección de portada</option>
              <option value="banner">Banner</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block label text-taupe">Clave</span>
            <input
              name="key"
              required
              pattern="[a-z0-9]+([-_][a-z0-9]+)*"
              className="field"
              placeholder="hero-otono"
            />
          </label>
          <label>
            <span className="mb-1 block label text-taupe">Título</span>
            <input name="title" className="field" />
          </label>
          <label>
            <span className="mb-1 block label text-taupe">Enlace del CTA</span>
            <input name="ctaHref" className="field" placeholder="/shop" />
          </label>
          <div className="sm:col-span-4">
            <button
              type="submit"
              disabled={save.isPending}
              className="btn btn-solid px-6 py-3 label disabled:bg-clay"
            >
              Crear en borrador
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
