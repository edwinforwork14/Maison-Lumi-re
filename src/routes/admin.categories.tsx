import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { adminListBrands, adminListCategories, adminListCollections, adminUpsertBrand, adminUpsertCategory, adminUpsertCollection, type AdminTaxonomyRow } from '@/features/admin/admin.api'

/** Categorías: árbol con recuento de productos, creación y edición. */
export const Route = createFileRoute('/admin/categories')({
  component: AdminCategoriesPage,
})

function AdminCategoriesPage() {
  const queryClient = useQueryClient()
  const [notice, setNotice] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const categories = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: () => adminListCategories(),
  })

  const save = useMutation({
    mutationFn: (input: {
      id?: string
      parentId?: string | null
      slug: string
      name: string
      position?: number
      status?: 'draft' | 'active' | 'archived'
    }) => adminUpsertCategory({ data: input }),
    onSuccess: (result) => {
      setNotice(result.created ? 'Categoría creada.' : 'Categoría actualizada.')
      setEditingId(null)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] })
    },
    onError: (error: Error) => setNotice(error.message),
  })

  return (
    <div className="space-y-6">
      <h2 className="eyebrow">Categorías</h2>

      {notice && (
        <p role="status" className="border border-linen bg-sand px-4 py-2 text-xs">
          {notice}
        </p>
      )}

      {categories.isPending ? (
        <div aria-busy="true" className="space-y-3">
          <p className="text-sm text-taupe">Cargando categorías…</p>
          <div className="skeleton h-16 w-full" />
        </div>
      ) : categories.isError ? (
        <div role="alert" className="border border-linen p-6 text-sm text-taupe">
          No se pudieron cargar las categorías.
          <button
            type="button"
            onClick={() => categories.refetch()}
            className="btn btn-outline ml-4 px-4 py-1 label"
          >
            Reintentar
          </button>
        </div>
      ) : categories.data.length === 0 ? (
        <p className="border border-linen p-6 text-sm text-taupe">Todavía no hay categorías.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Categorías del catálogo</caption>
          <thead>
            <tr className="border-b border-linen text-left">
              <th scope="col" className="py-2 pr-4 label text-taupe">Categoría</th>
              <th scope="col" className="py-2 pr-4 label text-taupe">Slug</th>
              <th scope="col" className="py-2 pr-4 label text-taupe">Padre</th>
              <th scope="col" className="py-2 pr-4 label text-taupe">Productos</th>
              <th scope="col" className="py-2 pr-4 label text-taupe">Estado</th>
              <th scope="col" className="py-2 label text-taupe">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {categories.data.map((category) => (
              <tr key={category.id} className="border-b border-linen align-top">
                <td className="py-3 pr-4">{category.name}</td>
                <td className="py-3 pr-4 text-xs text-taupe">{category.slug}</td>
                <td className="py-3 pr-4 text-xs text-taupe">
                  {categories.data.find((entry) => entry.id === category.parentId)?.name ?? '—'}
                </td>
                <td className="py-3 pr-4 tabular-nums">{category.productCount}</td>
                <td className="py-3 pr-4">{category.status}</td>
                <td className="py-3">
                  <button
                    type="button"
                    onClick={() => setEditingId(editingId === category.id ? null : category.id)}
                    aria-expanded={editingId === category.id}
                    className="btn btn-outline px-3 py-1 label"
                  >
                    {editingId === category.id ? 'Cerrar' : 'Editar'}
                  </button>

                  {editingId === category.id && (
                    <form
                      className="mt-3 grid gap-2 border border-linen p-3 sm:grid-cols-4"
                      onSubmit={(event) => {
                        event.preventDefault()
                        const form = new FormData(event.currentTarget)
                        const parentId = String(form.get('parentId') ?? '')
                        save.mutate({
                          id: category.id,
                          slug: String(form.get('slug') ?? ''),
                          name: String(form.get('name') ?? ''),
                          parentId: parentId === '' ? null : parentId,
                          position: Number(form.get('position') ?? 0),
                          status: String(form.get('status') ?? 'draft') as 'draft',
                        })
                      }}
                    >
                      <label>
                        <span className="mb-1 block label text-taupe">Nombre</span>
                        <input name="name" defaultValue={category.name} required className="field" />
                      </label>
                      <label>
                        <span className="mb-1 block label text-taupe">Slug</span>
                        <input
                          name="slug"
                          defaultValue={category.slug}
                          pattern="[a-z0-9]+(-[a-z0-9]+)*"
                          required
                          className="field"
                        />
                      </label>
                      <label>
                        <span className="mb-1 block label text-taupe">Categoría padre</span>
                        <select name="parentId" defaultValue={category.parentId ?? ''} className="field">
                          <option value="">Sin padre</option>
                          {categories.data
                            .filter((entry) => entry.id !== category.id)
                            .map((entry) => (
                              <option key={entry.id} value={entry.id}>
                                {entry.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        <span className="mb-1 block label text-taupe">Estado</span>
                        <select name="status" defaultValue={category.status} className="field">
                          <option value="draft">Borrador</option>
                          <option value="active">Activa</option>
                          <option value="archived">Archivada</option>
                        </select>
                      </label>
                      <input type="hidden" name="position" value={category.position} />
                      <div className="sm:col-span-4">
                        <button
                          type="submit"
                          disabled={save.isPending}
                          className="btn btn-solid px-4 py-2 label disabled:bg-clay"
                        >
                          {save.isPending ? 'Guardando…' : 'Guardar'}
                        </button>
                      </div>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <section className="border-t border-linen pt-6">
        <h3 className="mb-4 eyebrow">Nueva categoría</h3>
        <form
          className="grid gap-3 sm:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            const parentId = String(form.get('parentId') ?? '')
            save.mutate({
              slug: String(form.get('slug') ?? ''),
              name: String(form.get('name') ?? ''),
              parentId: parentId === '' ? null : parentId,
              status: 'draft',
            })
            event.currentTarget.reset()
          }}
        >
          <label>
            <span className="mb-1 block label text-taupe">Nombre</span>
            <input name="name" required className="field" />
          </label>
          <label>
            <span className="mb-1 block label text-taupe">Slug</span>
            <input name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" required className="field" />
          </label>
          <label>
            <span className="mb-1 block label text-taupe">Categoría padre</span>
            <select name="parentId" className="field" defaultValue="">
              <option value="">Sin padre</option>
              {(categories.data ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={save.isPending}
              className="btn btn-solid px-6 py-3 label disabled:bg-clay"
            >
              Crear
            </button>
          </div>
        </form>
      </section>

      <TaxonomyPanel
        kind="brand"
        title="Marcas"
        listKey={['admin', 'brands']}
        list={adminListBrands}
        upsert={adminUpsertBrand}
      />
      <TaxonomyPanel
        kind="collection"
        title="Colecciones"
        listKey={['admin', 'collections']}
        list={adminListCollections}
        upsert={adminUpsertCollection}
      />
    </div>
  )
}

/**
 * Marcas y colecciones (Plan 02 §4: `adminUpsertBrand` / `adminUpsertCollection`).
 * Misma disciplina que categorías: slug único, estado y posición auditados.
 */
function TaxonomyPanel({
  kind,
  title,
  listKey,
  list,
  upsert,
}: {
  kind: 'brand' | 'collection'
  title: string
  listKey: readonly unknown[]
  list: () => Promise<AdminTaxonomyRow[]>
  upsert: (args: {
    data: {
      id?: string
      slug: string
      name: string
      description?: string | null
      position?: number
      status?: 'draft' | 'active' | 'archived'
    }
  }) => Promise<{ id: string; created: boolean }>
}) {
  const queryClient = useQueryClient()
  const [notice, setNotice] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const rows = useQuery({ queryKey: listKey, queryFn: list })

  const save = useMutation({
    mutationFn: (input: {
      id?: string
      slug: string
      name: string
      position?: number
      status?: 'draft' | 'active' | 'archived'
    }) => upsert({ data: input }),
    onSuccess: (result) => {
      setNotice(result.created ? `${title} creada.` : `${title} actualizada.`)
      setEditingId(null)
      void queryClient.invalidateQueries({ queryKey: listKey })
    },
    onError: (error: Error) => setNotice(error.message),
  })

  return (
    <section className="border-t border-linen pt-6">
      <h3 className="mb-4 eyebrow">{title}</h3>

      {notice && (
        <p role="status" className="mb-4 border border-linen bg-sand px-4 py-2 text-xs">
          {notice}
        </p>
      )}

      {rows.isPending ? (
        <div aria-busy="true" className="space-y-3">
          <p className="text-sm text-taupe">Cargando…</p>
          <div className="skeleton h-12 w-full" />
        </div>
      ) : rows.isError ? (
        <div role="alert" className="border border-linen p-6 text-sm text-taupe">
          No se pudo cargar {title.toLowerCase()}.
          <button
            type="button"
            onClick={() => rows.refetch()}
            className="btn btn-outline ml-4 px-4 py-1 label"
          >
            Reintentar
          </button>
        </div>
      ) : rows.data.length === 0 ? (
        <p className="border border-linen p-4 text-sm text-taupe">Todavía no hay nada aquí.</p>
      ) : (
        <ul className="mb-6 divide-y divide-linen border border-linen">
          {rows.data.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="text-sm">{row.name}</p>
                <p className="text-xs text-taupe">
                  {row.slug} · {row.status} · {row.productCount} productos
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingId(editingId === row.id ? null : row.id)}
                aria-expanded={editingId === row.id}
                className="btn btn-outline px-3 py-1 label"
              >
                {editingId === row.id ? 'Cerrar' : 'Editar'}
              </button>
              {editingId === row.id && (
                <form
                  className="grid w-full gap-2 sm:grid-cols-4"
                  onSubmit={(event) => {
                    event.preventDefault()
                    const form = new FormData(event.currentTarget)
                    save.mutate({
                      id: row.id,
                      slug: String(form.get('slug') ?? ''),
                      name: String(form.get('name') ?? ''),
                      position: Number(form.get('position') ?? row.position),
                      status: String(form.get('status') ?? row.status) as 'draft',
                    })
                  }}
                >
                  <label>
                    <span className="mb-1 block label text-taupe">Nombre</span>
                    <input name="name" defaultValue={row.name} required className="field" />
                  </label>
                  <label>
                    <span className="mb-1 block label text-taupe">Slug</span>
                    <input
                      name="slug"
                      defaultValue={row.slug}
                      pattern="[a-z0-9]+(-[a-z0-9]+)*"
                      required
                      className="field"
                    />
                  </label>
                  <label>
                    <span className="mb-1 block label text-taupe">Estado</span>
                    <select name="status" defaultValue={row.status} className="field">
                      <option value="draft">Borrador</option>
                      <option value="active">Activo</option>
                      <option value="archived">Archivado</option>
                    </select>
                  </label>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      disabled={save.isPending}
                      className="btn btn-solid px-4 py-2 label disabled:bg-clay"
                    >
                      Guardar
                    </button>
                  </div>
                  <input type="hidden" name="position" value={row.position} />
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      <form
        className="grid gap-3 sm:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault()
          const form = new FormData(event.currentTarget)
          save.mutate({
            slug: String(form.get('slug') ?? ''),
            name: String(form.get('name') ?? ''),
            status: 'draft',
          })
          event.currentTarget.reset()
        }}
      >
        <label>
          <span className="mb-1 block label text-taupe">Nombre</span>
          <input name="name" required className="field" />
        </label>
        <label>
          <span className="mb-1 block label text-taupe">Slug</span>
          <input name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" required className="field" />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={save.isPending}
            className="btn btn-solid px-6 py-3 label disabled:bg-clay"
          >
            Crear
          </button>
        </div>
      </form>
    </section>
  )
}
