import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  adminArchiveProduct,
  adminAttachMedia,
  adminCreateProductWithVariants,
  adminListBrands,
  adminListCategories,
  adminListProducts,
  adminPublishProduct,
  adminSetProductStatus,
  type AdminProductListItem,
} from '@/features/admin/admin.api'
import { formatCents } from '@/lib/money-format'
import { queryKeys } from '@/features/model/queries'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

/** Catálogo: listar con filtros y cursor, crear (alta completa) y publicar/archivar. */
export const Route = createFileRoute('/admin/products/')({
  component: AdminProductsPage,
})

/** Slug legible a partir del nombre: sin acentos, en minúsculas y con guiones. */
function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

/** Fragmento para SKUs automáticos (mismo criterio que el servidor). */
function skuFragment(value: string, fallback: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || fallback
  )
}

const SIZE_PRESETS = ['Única', 'S', 'M', 'L', 'XL', 'XXL'] as const

interface NewSize {
  size: string
  stock: number
  sku: string
}
interface NewVariantGroup {
  color: string
  colorHex: string
  sizes: NewSize[]
}
interface NewImage {
  url: string
  alt: string
}
interface NewProductForm {
  name: string
  slug: string
  slugTouched: boolean
  categoryId: string
  brandId: string
  newBrandName: string
  description: string
  featured: boolean
  publish: boolean
  globalSizes: string[]
  price: string
  originalPrice: string
  variants: NewVariantGroup[]
  images: NewImage[]
}

function blankForm(categoryId: string): NewProductForm {
  return {
    name: '',
    slug: '',
    slugTouched: false,
    categoryId,
    brandId: '',
    newBrandName: '',
    description: '',
    featured: false,
    publish: false,
    globalSizes: ['Única'],
    price: '',
    originalPrice: '',
    variants: [],
    images: [],
  }
}

type CreateTab = 'basic' | 'pricing' | 'variants' | 'images'

const TABS: { id: CreateTab; label: string }[] = [
  { id: 'basic', label: '01. Básico' },
  { id: 'pricing', label: '02. Precio' },
  { id: 'variants', label: '03. Variantes' },
  { id: 'images', label: '04. Multimedia (Opcional)' },
]

function AdminProductsPage() {
  const queryClient = useQueryClient()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'' | 'draft' | 'active' | 'archived'>('')
  const [cursor, setCursor] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const navigate = useNavigate()

  const [createOpen, setCreateOpen] = useState(false)
  const [tab, setTab] = useState<CreateTab>('basic')
  const [form, setForm] = useState<NewProductForm>(() => blankForm(''))
  const update = <K extends keyof NewProductForm>(key: K, value: NewProductForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

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
    // Se incluyen los borradores: una categoría recién creada no debe impedir
    // dar de alta un producto (la lista pública solo muestra las publicadas).
    queryFn: () => adminListCategories(),
  })

  const brands = useQuery({
    queryKey: ['admin', 'brands'],
    queryFn: () => adminListBrands(),
  })

  const categoryOptions = categories.data ?? []
  const brandOptions = brands.data ?? []
  const hasCategories = categoryOptions.length > 0

  const effectiveSlug = form.slugTouched ? form.slug : slugify(form.name)
  const autoSku = (color: string, size: string) =>
    `${effectiveSlug}-${skuFragment(color, 'COLOR')}-${skuFragment(size, 'UNICA')}`

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'products'] })
    void queryClient.invalidateQueries({ queryKey: ['admin', 'kpis'] })
    void queryClient.invalidateQueries({ queryKey: ['admin', 'brands'] })
    // El catálogo público de la tienda debe reflejar el cambio (Plan 02 §4).
    void queryClient.invalidateQueries({ queryKey: queryKeys.products() })
  }

  const openCreate = () => {
    setForm(blankForm(categoryOptions[0]?.id ?? ''))
    setTab('basic')
    setNotice('')
    setCreateOpen(true)
  }

  const setStatusMutation = useMutation({
    mutationFn: (input: {
      id: string
      status: 'draft' | 'active' | 'archived'
      version?: string
    }) => {
      // Nombres congelados del Plan 02 §4 (los consume la invalidación del 03).
      if (input.status === 'active') return adminPublishProduct({ data: { id: input.id, version: input.version } })
      if (input.status === 'archived') return adminArchiveProduct({ data: { id: input.id, version: input.version } })
      return adminSetProductStatus({ data: { id: input.id, status: input.status, version: input.version } })
    },
    onSuccess: (result) => {
      setNotice(`Producto ${result.status === 'active' ? 'publicado' : 'actualizado'}.`)
      invalidate()
    },
    onError: (error: Error) => setNotice(error.message),
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const priceCents = Math.round(Number(form.price) * 100)
      const result = await adminCreateProductWithVariants({
        data: {
          name: form.name,
          slug: effectiveSlug,
          categoryId: form.categoryId,
          brandId: form.brandId || null,
          brandName: form.brandId ? null : form.newBrandName.trim() || null,
          description: form.description.trim() || undefined,
          featured: form.featured,
          publish: form.publish,
          priceCents,
          compareAtPriceCents: form.originalPrice
            ? Math.round(Number(form.originalPrice) * 100)
            : null,
          variants: form.variants.map((group) => ({
            color: group.color,
            colorHex: group.colorHex || null,
            sizes: group.sizes.map((entry) => ({
              size: entry.size,
              stock: entry.stock,
              sku: entry.sku.trim() || null,
            })),
          })),
        },
      })
      // Multimedia opcional: se adjunta por URL tras crear el producto (el
      // contrato de subida pre-firmada aún no tiene almacén configurado).
      for (const [index, image] of form.images.entries()) {
        await adminAttachMedia({
          data: {
            productId: result.id,
            storageKey: image.url.trim(),
            alt: image.alt.trim() || form.name,
            position: index,
          },
        })
      }
      return result
    },
    onSuccess: (result) => {
      setNotice(
        result.status === 'active'
          ? 'Producto creado y publicado con sus variantes y stock.'
          : 'Producto creado en borrador con sus variantes y stock.',
      )
      setCreateOpen(false)
      invalidate()
      void navigate({ to: '/admin/products/$id', params: { id: result.id } })
    },
    onError: (error: Error) => setNotice(error.message),
  })

  const addColor = () => {
    setForm((current) => ({
      ...current,
      variants: [
        ...current.variants,
        {
          color: '',
          colorHex: '#000000',
          sizes: current.globalSizes.map((size) => ({ size, stock: 0, sku: '' })),
        },
      ],
    }))
  }
  const removeColor = (index: number) =>
    setForm((current) => ({
      ...current,
      variants: current.variants.filter((_, i) => i !== index),
    }))
  const patchGroup = (index: number, patch: Partial<NewVariantGroup>) =>
    setForm((current) => ({
      ...current,
      variants: current.variants.map((group, i) => (i === index ? { ...group, ...patch } : group)),
    }))
  const patchSize = (groupIndex: number, sizeIndex: number, patch: Partial<NewSize>) =>
    setForm((current) => ({
      ...current,
      variants: current.variants.map((group, i) =>
        i === groupIndex
          ? {
              ...group,
              sizes: group.sizes.map((entry, j) => (j === sizeIndex ? { ...entry, ...patch } : entry)),
            }
          : group,
      ),
    }))

  const toggleGlobalSize = (size: string) =>
    setForm((current) => ({
      ...current,
      globalSizes: current.globalSizes.includes(size)
        ? current.globalSizes.filter((s) => s !== size)
        : [...current.globalSizes, size],
    }))

  const canSubmit =
    form.name.trim().length >= 2 &&
    effectiveSlug.length >= 3 &&
    form.categoryId &&
    Number(form.price) >= 0 &&
    form.price !== '' &&
    form.variants.length > 0 &&
    form.variants.every((group) => group.color.trim() && group.sizes.length > 0)

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 className="eyebrow">Productos</h2>
          {hasCategories && (
            <Button variant="primary" onClick={openCreate}>
              Nuevo producto
            </Button>
          )}
        </div>

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

        {!hasCategories && (
          <p className="mb-4 border border-linen bg-sand p-4 text-sm text-taupe">
            Necesita al menos una categoría para dar de alta productos.{' '}
            <Link to="/admin/categories" className="underline underline-offset-4">
              Cree una categoría
            </Link>{' '}
            y vuelva aquí.
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
                    onPublish={() =>
                      setStatusMutation.mutate({
                        id: product.id,
                        status: 'active',
                        version: new Date(product.updatedAt).toISOString(),
                      })
                    }
                    onArchive={() =>
                      setStatusMutation.mutate({
                        id: product.id,
                        status: 'archived',
                        version: new Date(product.updatedAt).toISOString(),
                      })
                    }
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

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nuevo registro">
        <div className="flex flex-col">
          <div className="grid grid-cols-4 border-b border-line text-center">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTab(entry.id)}
                className={cn(
                  'px-2 py-3 text-[10px] uppercase tracking-widest transition-colors',
                  tab === entry.id
                    ? 'bg-strong text-surface'
                    : 'text-text-secondary hover:text-strong',
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <div className="space-y-5 p-6">
            {tab === 'basic' && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label>
                    <span className="mb-1 block label text-taupe">Nombre del producto</span>
                    <input
                      value={form.name}
                      onChange={(event) => update('name', event.target.value)}
                      className="field"
                      required
                    />
                  </label>
                  <label>
                    <span className="mb-1 block label text-taupe">Slug</span>
                    <input
                      value={effectiveSlug}
                      onChange={(event) => {
                        update('slug', event.target.value)
                        update('slugTouched', true)
                      }}
                      pattern="[a-z0-9]+(-[a-z0-9]+)*"
                      className="field"
                      required
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1 block label text-taupe">Descripción</span>
                  <textarea
                    value={form.description}
                    onChange={(event) => update('description', event.target.value)}
                    rows={3}
                    className="field"
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label>
                    <span className="mb-1 block label text-taupe">Categoría</span>
                    <select
                      value={form.categoryId}
                      onChange={(event) => update('categoryId', event.target.value)}
                      className="field"
                      required
                    >
                      <option value="">Seleccionar…</option>
                      {categoryOptions.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="space-y-3">
                    <label>
                      <span className="mb-1 block label text-taupe">Marca</span>
                      <select
                        value={form.brandId}
                        onChange={(event) => update('brandId', event.target.value)}
                        className="field"
                      >
                        <option value="">Sin marca</option>
                        {brandOptions.map((brand) => (
                          <option key={brand.id} value={brand.id}>
                            {brand.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {!form.brandId && (
                      <label>
                        <span className="mb-1 block label text-taupe">… o nueva marca</span>
                        <input
                          value={form.newBrandName}
                          onChange={(event) => update('newBrandName', event.target.value)}
                          placeholder="Se crea si no existe"
                          className="field"
                        />
                      </label>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-6 border-t border-line pt-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.publish}
                      onChange={(event) => update('publish', event.target.checked)}
                    />
                    <span className="label text-taupe">Publicar ahora</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.featured}
                      onChange={(event) => update('featured', event.target.checked)}
                    />
                    <span className="label text-taupe">Destacado</span>
                  </label>
                </div>

                <div className="border-t border-line pt-4">
                  <span className="mb-2 block label text-taupe">Tallas del producto</span>
                  <div className="flex flex-wrap gap-2">
                    {SIZE_PRESETS.map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => toggleGlobalSize(size)}
                        className={cn(
                          'btn px-4 py-2 label',
                          form.globalSizes.includes(size) ? 'btn-solid' : 'btn-outline',
                        )}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-taupe">
                    Las tallas marcadas se crean en cada color al añadirlo (pestaña 03).
                  </p>
                </div>
              </>
            )}

            {tab === 'pricing' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="mb-1 block label text-taupe">Precio (€)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.price}
                    onChange={(event) => update('price', event.target.value)}
                    className="field"
                    required
                  />
                </label>
                <label>
                  <span className="mb-1 block label text-taupe">Precio anterior / tachado (€)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.originalPrice}
                    onChange={(event) => update('originalPrice', event.target.value)}
                    className="field"
                  />
                </label>
                <p className="sm:col-span-2 text-xs text-taupe">
                  Ese precio se aplica a todas las variantes del producto.
                </p>
              </div>
            )}

            {tab === 'variants' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-taupe">
                    Añada un color por bloque; dentro, cada talla lleva su stock y su SKU.
                    Si deja el SKU vacío se genera solo.
                  </p>
                  <button type="button" onClick={addColor} className="btn btn-outline px-4 py-2 label">
                    Añadir color
                  </button>
                </div>

                {form.variants.length === 0 ? (
                  <p className="border border-dashed border-linen p-6 text-center text-sm text-taupe">
                    No hay variantes. Añada al menos un color.
                  </p>
                ) : (
                  form.variants.map((group, groupIndex) => (
                    <div key={groupIndex} className="border border-line p-4">
                      <div className="mb-3 flex flex-wrap items-end gap-3">
                        <label className="flex-1 min-w-40">
                          <span className="mb-1 block label text-taupe">Color</span>
                          <input
                            value={group.color}
                            onChange={(event) => patchGroup(groupIndex, { color: event.target.value })}
                            placeholder="Ej: Marfil"
                            className="field"
                          />
                        </label>
                        <label>
                          <span className="mb-1 block label text-taupe">Hex</span>
                          <span className="flex items-center gap-2">
                            <input
                              type="color"
                              value={group.colorHex}
                              onChange={(event) => patchGroup(groupIndex, { colorHex: event.target.value })}
                              className="h-10 w-12 cursor-pointer border border-line bg-transparent"
                              aria-label="Selector de color"
                            />
                            <input
                              value={group.colorHex}
                              onChange={(event) => patchGroup(groupIndex, { colorHex: event.target.value })}
                              className="field w-28"
                            />
                          </span>
                        </label>
                        <button
                          type="button"
                          onClick={() => removeColor(groupIndex)}
                          className="btn btn-outline px-4 py-2 label"
                        >
                          Quitar color
                        </button>
                      </div>

                      <table className="w-full border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-linen text-left">
                            <th className="py-1 pr-4 label text-taupe">Talla</th>
                            <th className="py-1 pr-4 label text-taupe">Stock</th>
                            <th className="py-1 pr-4 label text-taupe">SKU</th>
                            <th className="py-1 label text-taupe" />
                          </tr>
                        </thead>
                        <tbody>
                          {group.sizes.map((entry, sizeIndex) => (
                            <tr key={sizeIndex} className="border-b border-linen">
                              <td className="py-2 pr-4">
                                <input
                                  value={entry.size}
                                  onChange={(event) =>
                                    patchSize(groupIndex, sizeIndex, { size: event.target.value })
                                  }
                                  className="field w-24"
                                />
                              </td>
                              <td className="py-2 pr-4">
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={entry.stock}
                                  onChange={(event) =>
                                    patchSize(groupIndex, sizeIndex, {
                                      stock: Math.max(0, Math.trunc(Number(event.target.value) || 0)),
                                    })
                                  }
                                  className="field w-24"
                                />
                              </td>
                              <td className="py-2 pr-4">
                                <input
                                  value={entry.sku}
                                  onChange={(event) =>
                                    patchSize(groupIndex, sizeIndex, { sku: event.target.value })
                                  }
                                  placeholder={autoSku(group.color, entry.size)}
                                  className="field"
                                />
                              </td>
                              <td className="py-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    patchGroup(groupIndex, {
                                      sizes: group.sizes.filter((_, i) => i !== sizeIndex),
                                    })
                                  }
                                  className="text-xs text-taupe underline underline-offset-4"
                                >
                                  Quitar
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <button
                        type="button"
                        onClick={() =>
                          patchGroup(groupIndex, {
                            sizes: [...group.sizes, { size: '', stock: 0, sku: '' }],
                          })
                        }
                        className="mt-2 text-xs text-taupe underline underline-offset-4"
                      >
                        Añadir talla
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === 'images' && (
              <div className="space-y-3">
                <p className="text-xs text-taupe">
                  Opcional. La subida de archivos necesita un almacén configurado; mientras tanto
                  se adjuntan por URL (imagen principal = primera).
                </p>
                {form.images.map((image, index) => (
                  <div key={index} className="flex flex-wrap items-end gap-3 border border-line p-3">
                    <label className="flex-1 min-w-48">
                      <span className="mb-1 block label text-taupe">URL de la imagen</span>
                      <input
                        value={image.url}
                        onChange={(event) =>
                          update(
                            'images',
                            form.images.map((item, i) =>
                              i === index ? { ...item, url: event.target.value } : item,
                            ),
                          )
                        }
                        placeholder="https://…"
                        className="field"
                      />
                    </label>
                    <label className="flex-1 min-w-40">
                      <span className="mb-1 block label text-taupe">Texto alternativo</span>
                      <input
                        value={image.alt}
                        onChange={(event) =>
                          update(
                            'images',
                            form.images.map((item, i) =>
                              i === index ? { ...item, alt: event.target.value } : item,
                            ),
                          )
                        }
                        className="field"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => update('images', form.images.filter((_, i) => i !== index))}
                      className="btn btn-outline px-4 py-2 label"
                    >
                      Quitar
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => update('images', [...form.images, { url: '', alt: '' }])}
                  className="btn btn-outline px-4 py-2 label"
                >
                  Añadir imagen
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-sand p-6">
            <p className="text-xs text-taupe">
              {form.variants.length} color(es) · {form.variants.reduce((sum, g) => sum + g.sizes.length, 0)} variante(s)
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                disabled={!canSubmit || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? 'Creando…' : 'Confirmar registro'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
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
          <Link
            to="/admin/products/$id"
            params={{ id: product.id }}
            className="btn btn-outline px-3 py-1 label"
          >
            Abrir
          </Link>
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
