import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  adminDeleteVariant,
  adminGetProduct,
  adminListCategories,
  adminSetProductStatus,
  adminUpdateProduct,
  adminUpsertVariant,
  type AdminVariant,
} from '@/features/admin/admin.api'
import { formatCents } from '@/lib/money-format'

/**
 * Ficha de producto: edición, variantes y publicación.
 *
 * Publicar exige al menos una variante (lo impone el servidor). Borrar una
 * variante con historia comercial no la destruye: la archiva, porque el ledger
 * de inventario y los pedidos son append-only.
 */
export const Route = createFileRoute('/admin/products/$id')({
  component: AdminProductDetailPage,
})

function AdminProductDetailPage() {
  const { id } = Route.useParams()
  const queryClient = useQueryClient()
  const [notice, setNotice] = useState('')

  const product = useQuery({
    queryKey: ['admin', 'product', id],
    queryFn: () => adminGetProduct({ data: { id } }),
  })
  const categories = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: () => adminListCategories(),
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'product', id] })
    void queryClient.invalidateQueries({ queryKey: ['admin', 'products'] })
    void queryClient.invalidateQueries({ queryKey: ['admin', 'inventory'] })
  }

  const saveProduct = useMutation({
    mutationFn: (patch: { name?: string; categoryId?: string; featured?: boolean }) =>
      adminUpdateProduct({ data: { id, ...patch } }),
    onSuccess: (result) =>
      setNotice(
        result.changed.length === 0
          ? 'Sin cambios que guardar.'
          : `Guardado: ${result.changed.join(', ')}.`,
      ),
    onError: (error: Error) => setNotice(error.message),
  })

  const setStatus = useMutation({
    mutationFn: (status: 'draft' | 'active' | 'archived') =>
      adminSetProductStatus({ data: { id, status } }),
    onSuccess: (result) => setNotice(`Estado: ${result.status}.`),
    onError: (error: Error) => setNotice(error.message),
  })

  const saveVariant = useMutation({
    mutationFn: (input: {
      id?: string
      sku: string
      size: string
      color: string
      priceCents: number
      compareAtPriceCents?: number | null
      status?: 'draft' | 'active' | 'archived'
    }) => adminUpsertVariant({ data: { productId: id, ...input } }),
    onSuccess: () => {
      setNotice('Variante guardada.')
      invalidate()
    },
    onError: (error: Error) => setNotice(error.message),
  })

  const removeVariant = useMutation({
    mutationFn: (variantId: string) => adminDeleteVariant({ data: { id: variantId } }),
    onSuccess: (result) => {
      setNotice(
        result.deleted
          ? 'Variante borrada.'
          : 'La variante tenía historia: se ha archivado en lugar de borrarse.',
      )
      invalidate()
    },
    onError: (error: Error) => setNotice(error.message),
  })

  if (product.isPending) {
    return (
      <div aria-busy="true" className="space-y-3">
        <p className="text-sm text-taupe">Cargando el producto…</p>
        <div className="skeleton h-24 w-full" />
      </div>
    )
  }

  if (product.isError || !product.data) {
    return (
      <div role="alert" className="border border-linen p-6 text-sm text-taupe">
        No se pudo cargar el producto.
        <button
          type="button"
          onClick={() => product.refetch()}
          className="btn btn-outline ml-4 px-4 py-1 label"
        >
          Reintentar
        </button>
      </div>
    )
  }

  const detail = product.data

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/admin/products" className="label text-taupe underline-offset-4 hover:underline">
            ← Productos
          </Link>
          <h2 className="mt-2 font-serif text-2xl font-light">{detail.name}</h2>
          <p className="text-xs text-taupe">
            {detail.slug} · {detail.status}
            {detail.publishedAt
              ? ` · publicado ${new Date(detail.publishedAt).toLocaleDateString('es-ES')}`
              : ''}
          </p>
        </div>
        <div className="flex gap-2">
          {detail.status !== 'active' && (
            <button
              type="button"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate('active')}
              className="btn btn-outline px-4 py-2 label"
            >
              Publicar
            </button>
          )}
          {detail.status === 'active' && (
            <button
              type="button"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate('archived')}
              className="btn btn-outline px-4 py-2 label"
            >
              Archivar
            </button>
          )}
        </div>
      </div>

      {notice && (
        <p role="status" className="border border-linen bg-sand px-4 py-2 text-xs">
          {notice}
        </p>
      )}

      <section className="border-t border-linen pt-6">
        <h3 className="mb-4 eyebrow">Datos del producto</h3>
        <form
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            saveProduct.mutate({
              name: String(form.get('name') ?? ''),
              categoryId: String(form.get('categoryId') ?? ''),
              featured: form.get('featured') === 'on',
            })
          }}
        >
          <label>
            <span className="mb-1 block label text-taupe">Nombre</span>
            <input name="name" defaultValue={detail.name} className="field" required />
          </label>
          <label>
            <span className="mb-1 block label text-taupe">Categoría</span>
            <select name="categoryId" defaultValue={detail.categoryId} className="field">
              {(categories.data ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-end gap-2 pb-3">
            <input type="checkbox" name="featured" defaultChecked={detail.featured} />
            <span className="label text-taupe">Destacado</span>
          </label>
          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={saveProduct.isPending}
              className="btn btn-solid px-6 py-3 label disabled:bg-clay"
            >
              {saveProduct.isPending ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </section>

      <section>
        <h3 className="mb-4 eyebrow">Variantes ({detail.variants.length})</h3>
        {detail.variants.length === 0 ? (
          <p className="border border-linen p-4 text-sm text-taupe">
            Sin variantes: un producto sin variantes no se puede publicar.
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Variantes del producto</caption>
            <thead>
              <tr className="border-b border-linen text-left">
                <th scope="col" className="py-2 pr-4 label text-taupe">SKU</th>
                <th scope="col" className="py-2 pr-4 label text-taupe">Color</th>
                <th scope="col" className="py-2 pr-4 label text-taupe">Talla</th>
                <th scope="col" className="py-2 pr-4 label text-taupe">Precio</th>
                <th scope="col" className="py-2 pr-4 label text-taupe">Stock</th>
                <th scope="col" className="py-2 label text-taupe">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {detail.variants.map((variant) => (
                <VariantRow
                  key={variant.id}
                  variant={variant}
                  busy={removeVariant.isPending}
                  onSave={(values) => saveVariant.mutate({ id: variant.id, ...values })}
                  onRemove={() => removeVariant.mutate(variant.id)}
                />
              ))}
            </tbody>
          </table>
        )}

        <form
          className="mt-6 grid gap-3 border border-linen p-4 sm:grid-cols-5"
          onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            saveVariant.mutate({
              sku: String(form.get('sku') ?? ''),
              color: String(form.get('color') ?? ''),
              size: String(form.get('size') ?? 'Única'),
              priceCents: Math.round(Number(form.get('price') ?? 0) * 100),
            })
            event.currentTarget.reset()
          }}
        >
          <p className="sm:col-span-5 eyebrow">Nueva variante</p>
          <label>
            <span className="mb-1 block label text-taupe">SKU</span>
            <input name="sku" required className="field" />
          </label>
          <label>
            <span className="mb-1 block label text-taupe">Color</span>
            <input name="color" required className="field" />
          </label>
          <label>
            <span className="mb-1 block label text-taupe">Talla</span>
            <input name="size" defaultValue="Única" className="field" />
          </label>
          <label>
            <span className="mb-1 block label text-taupe">Precio (€)</span>
            <input name="price" type="number" step="0.01" min="0" required className="field" />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={saveVariant.isPending}
              className="btn btn-solid px-4 py-3 label disabled:bg-clay"
            >
              Añadir
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

function VariantRow({
  variant,
  busy,
  onSave,
  onRemove,
}: {
  variant: AdminVariant
  busy: boolean
  onSave: (values: { sku: string; color: string; size: string; priceCents: number }) => void
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)

  return (
    <tr className="border-b border-linen align-middle">
      <td className="py-3 pr-4">{variant.sku}</td>
      <td className="py-3 pr-4">{variant.color}</td>
      <td className="py-3 pr-4">{variant.size}</td>
      <td className="py-3 pr-4 tabular-nums">
        {formatCents(variant.priceCents)}
        {variant.compareAtPriceCents ? (
          <span className="ml-2 text-xs text-clay line-through">
            {formatCents(variant.compareAtPriceCents)}
          </span>
        ) : null}
      </td>
      <td className="py-3 pr-4 tabular-nums">
        {variant.onHand}
        {variant.reserved > 0 ? (
          <span className="text-xs text-taupe"> ({variant.reserved} reservadas)</span>
        ) : null}
      </td>
      <td className="py-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEditing((value) => !value)}
            aria-expanded={editing}
            className="btn btn-outline px-3 py-1 label"
          >
            {editing ? 'Cerrar' : 'Editar'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onRemove}
            className="btn btn-outline px-3 py-1 label disabled:text-clay"
          >
            Borrar
          </button>
        </div>

        {editing && (
          <form
            className="mt-3 grid gap-2 border border-linen p-3 sm:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault()
              const form = new FormData(event.currentTarget)
              onSave({
                sku: String(form.get('sku') ?? ''),
                color: String(form.get('color') ?? ''),
                size: String(form.get('size') ?? ''),
                priceCents: Math.round(Number(form.get('price') ?? 0) * 100),
              })
              setEditing(false)
            }}
          >
            <label>
              <span className="mb-1 block label text-taupe">SKU</span>
              <input name="sku" defaultValue={variant.sku} required className="field" />
            </label>
            <label>
              <span className="mb-1 block label text-taupe">Color</span>
              <input name="color" defaultValue={variant.color} required className="field" />
            </label>
            <label>
              <span className="mb-1 block label text-taupe">Talla</span>
              <input name="size" defaultValue={variant.size} className="field" />
            </label>
            <label>
              <span className="mb-1 block label text-taupe">Precio (€)</span>
              <input
                name="price"
                type="number"
                step="0.01"
                min="0"
                defaultValue={(variant.priceCents / 100).toFixed(2)}
                className="field"
              />
            </label>
            <div className="sm:col-span-4">
              <button type="submit" className="btn btn-solid px-4 py-2 label">
                Guardar variante
              </button>
            </div>
          </form>
        )}
      </td>
    </tr>
  )
}
