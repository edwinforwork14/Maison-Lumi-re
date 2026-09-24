import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  adminCreateProduct,
  adminListProducts,
  adminSetProductStatus,
  type AdminProductListItem,
} from '@/features/admin/admin.api'
import { listCategories } from '@/features/commerce.api'
import { formatCents } from '@/lib/money-format'

/** Catálogo: listar con filtros y cursor, crear y publicar/archivar. */
export const Route = createFileRoute('/admin/products')({
  component: AdminProductsPage,
})

function AdminProductsPage() {
  const queryClient = useQueryClient()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'' | 'draft' | 'active' | 'archived'>('')
  const [cursor, setCursor] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  const filters = {
    q: q.trim() || undefined,
    status: status || undefined,
    cursor,
    size: 20,
  }

  const products = useQuery({
    queryKey: ['admin', 'products', filters],
    queryFn: () => adminListProducts({ data: filters }),
  })

  const categories = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: () => listCategories(),
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'products'] })
    void queryClient.invalidateQueries({ queryKey: ['admin', 'kpis'] })
  }

  const setStatusMutation = useMutation({
    mutationFn: (input: { id: string; status: 'draft' | 'active' | 'archived' }) =>
      adminSetProductStatus({ data: input }),
    onSuccess: (result) => {
      setNotice(`Producto ${result.status === 'active' ? 'publicado' : 'actualizado'}.`)
      invalidate()
    },
    onError: (error: Error) => setNotice(error.message),
  })

  const createMutation = useMutation({
    mutationFn: (input: { slug: string; name: string; categoryId: string }) =>
      adminCreateProduct({ data: input }),
    onSuccess: () => {
      setNotice('Producto creado en borrador. Añada una variante antes de publicarlo.')
      invalidate()
    },
    onError: (error: Error) => setNotice(error.message),
  })

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-4 eyebrow">Productos</h2>

        <div className="mb-6 flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-48">
            <span className="mb-1 block label text-taupe">Buscar</span>
            <input
              type="search"
              value={q}
              onChange={(event) => {
                setQ(event.target.value)
                setCursor(null)
              }}
              placeholder="Nombre o slug"
              className="field"
            />
          </label>
          <label>
            <span className="mb-1 block label text-taupe">Estado</span>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as typeof status)
                setCursor(null)
              }}
              className="field"
            >
              <option value="">Todos</option>
              <option value="draft">Borrador</option>
              <option value="active">Publicado</option>
              <option value="archived">Archivado</option>
            </select>
          </label>
        </div>

        {notice && (
          <p role="status" className="mb-4 border border-linen bg-sand px-4 py-2 text-xs">
            {notice}
          </p>
        )}

        {products.isPending ? (
          <div aria-busy="true" className="space-y-3">
            <p className="text-sm text-taupe">Cargando productos…</p>
            <div className="skeleton h-16 w-full" />
          </div>
        ) : products.isError ? (
          <div role="alert" className="border border-linen p-6 text-sm text-taupe">
            No se pudieron cargar los productos.
            <button
              type="button"
              onClick={() => products.refetch()}
              className="btn btn-outline ml-4 px-4 py-1 label"
            >
              Reintentar
            </button>
          </div>
        ) : products.data.items.length === 0 ? (
          <p className="border border-linen p-6 text-sm text-taupe">
            No hay productos que cumplan el filtro.
          </p>
        ) : (
          <>
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Productos del catálogo</caption>
              <thead>
                <tr className="border-b border-linen text-left">
                  <th scope="col" className="py-2 pr-4 label text-taupe">Producto</th>
                  <th scope="col" className="py-2 pr-4 label text-taupe">Estado</th>
                  <th scope="col" className="py-2 pr-4 label text-taupe">Variantes</th>
                  <th scope="col" className="py-2 pr-4 label text-taupe">Desde</th>
                  <th scope="col" className="py-2 pr-4 label text-taupe">Stock</th>
                  <th scope="col" className="py-2 label text-taupe">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {products.data.items.map((product) => (
                  <Row
                    key={product.id}
                    product={product}
                    busy={setStatusMutation.isPending}
                    onPublish={() => setStatusMutation.mutate({ id: product.id, status: 'active' })}
                    onArchive={() => setStatusMutation.mutate({ id: product.id, status: 'archived' })}
                  />
                ))}
              </tbody>
            </table>

            <div className="mt-4 flex items-center gap-4">
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
                disabled={!products.data.hasMore}
                onClick={() => setCursor(products.data.nextCursor)}
                className="btn btn-outline px-4 py-2 label disabled:text-clay"
              >
                Siguiente
              </button>
            </div>
          </>
        )}
      </section>

      <section className="border-t border-linen pt-8">
        <h3 className="mb-4 eyebrow">Nuevo producto</h3>
        <form
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            createMutation.mutate({
              slug: String(form.get('slug') ?? ''),
              name: String(form.get('name') ?? ''),
              categoryId: String(form.get('categoryId') ?? ''),
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
            <input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" className="field" />
          </label>
          <label>
            <span className="mb-1 block label text-taupe">Categoría</span>
            <select name="categoryId" required className="field">
              <option value="">Seleccione…</option>
              {(categories.data ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="btn btn-solid px-6 py-3 label disabled:bg-clay"
            >
              {createMutation.isPending ? 'Creando…' : 'Crear en borrador'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

function Row({
  product,
  busy,
  onPublish,
  onArchive,
}: {
  product: AdminProductListItem
  busy: boolean
  onPublish: () => void
  onArchive: () => void
}) {
  return (
    <tr className="border-b border-linen align-middle">
      <td className="py-3 pr-4">
        {product.name}
        <span className="block text-xs text-taupe">{product.slug}</span>
      </td>
      <td className="py-2 pr-4">{product.status}</td>
      <td className="py-2 pr-4 tabular-nums">{product.variantCount}</td>
      <td className="py-2 pr-4 tabular-nums">
        {product.minPriceCents === null ? '—' : formatCents(product.minPriceCents)}
      </td>
      <td className="py-2 pr-4 tabular-nums">{product.totalStock}</td>
      <td className="py-2">
        <div className="flex gap-2">
          {product.status !== 'active' && (
            <button
              type="button"
              disabled={busy}
              onClick={onPublish}
              className="btn btn-outline px-3 py-1 label disabled:text-clay"
            >
              Publicar
            </button>
          )}
          {product.status === 'active' && (
            <button
              type="button"
              disabled={busy}
              onClick={onArchive}
              className="btn btn-outline px-3 py-1 label disabled:text-clay"
            >
              Archivar
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
