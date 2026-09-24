import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  createFileRoute,
  useSearch,
  useNavigate,
} from '@tanstack/react-router'
import { listProducts, listCategories, listCollections, listFacets } from '@/features/commerce.api'
import { centsOfMajor } from '@/lib/money-format'
import type { SortId } from '@/domain/catalog'
import { ProductGrid } from '@/components/product/ProductGrid'
import { EmptyState } from '@/components/ui/EmptyState'

interface ShopSearch {
  category?: string
  collection?: string
  /** Escalar con un valor (URL canónica) o array JSON con varios. */
  color?: string | string[]
  material?: string | string[]
  priceMin?: number
  priceMax?: number
  sort?: SortId
}

/** Normaliza el valor de search (escalar o array) a lista. */
const asArray = (v: string | string[] | undefined): string[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v]

export const Route = createFileRoute('/_storefront/shop')({
  validateSearch: (search: Record<string, unknown>): ShopSearch => ({
    category: typeof search.category === 'string' ? search.category : undefined,
    collection:
      typeof search.collection === 'string' ? search.collection : undefined,
    color: Array.isArray(search.color)
      ? (search.color as string[])
      : typeof search.color === 'string'
        ? search.color
        : undefined,
    material: Array.isArray(search.material)
      ? (search.material as string[])
      : typeof search.material === 'string'
        ? search.material
        : undefined,
    priceMin:
      typeof search.priceMin === 'string'
        ? Number(search.priceMin)
        : typeof search.priceMin === 'number'
          ? search.priceMin
          : undefined,
    priceMax:
      typeof search.priceMax === 'string'
        ? Number(search.priceMax)
        : typeof search.priceMax === 'number'
          ? search.priceMax
          : undefined,
    sort: typeof search.sort === 'string' ? (search.sort as SortId) : undefined,
  }),
  head: () => ({
    meta: [
      { title: 'Tienda — Maison Lumière' },
      {
        name: 'description',
        content: 'Catálogo completo de Maison Lumière: gafas, bolsos, zapatos y accesorios.',
      },
    ],
  }),
  loader: async () => {
    const [products, categories, collections, facets] = await Promise.all([
      listProducts(),
      listCategories(),
      listCollections(),
      listFacets(),
    ])
    return { products, categories, collections, facets }
  },
  // Estado de carga por ruta (defecto D19)
  pendingComponent: ShopSkeleton,
  component: ShopPage,
})

function ShopSkeleton() {
  return (
    <div>
      <header className="border-b border-linen bg-sand px-4 py-14 md:px-8 md:py-20">
        <div className="mx-auto max-w-7xl space-y-4">
          <div className="skeleton h-4 w-24" />
          <div className="skeleton h-10 w-72" />
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:px-8 lg:grid-cols-[224px_1fr]">
        <div className="hidden space-y-4 lg:block">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-4 w-full" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <div className="skeleton aspect-3/4 w-full" />
              <div className="skeleton h-4 w-3/4" />
              <div className="skeleton h-4 w-1/3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const sorts: { id: SortId; label: string }[] = [
  { id: 'recommended', label: 'Recomendados' },
  { id: 'price-asc', label: 'Precio: menor a mayor' },
  { id: 'price-desc', label: 'Precio: mayor a menor' },
  { id: 'bestsellers', label: 'Más vendidos' },
  { id: 'new', label: 'Nuevos' },
]

function ShopPage() {
  const search = useSearch({ from: '/_storefront/shop' })
  const navigate = useNavigate()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const loaderData = Route.useLoaderData()

  const { data: filtered = [] } = useQuery({
    queryKey: [
      'products',
      search.category,
      search.collection,
      search.color,
      search.material,
      search.priceMin,
      search.priceMax,
      search.sort,
    ],
    queryFn: () =>
      listProducts({
        data: {
          category: search.category,
          collection: search.collection,
          colors: asArray(search.color),
          materials: asArray(search.material),
          // La URL viaja en euros (legible y canónica); la API habla céntimos.
          priceMinCents: centsOfMajor(search.priceMin),
          priceMaxCents: centsOfMajor(search.priceMax),
          sort: search.sort,
        },
      }),
  })

  const products = filtered
  const categories = loaderData.categories
  const collections = loaderData.collections
  const facets = loaderData.facets

  const category = categories.find((c) => c.id === search.category)
  const collection = collections.find((c) => c.id === search.collection)

  const setParam = (updates: Partial<ShopSearch>) => {
    navigate({
      to: '/shop',
      search: (prev: ShopSearch) => ({ ...prev, ...updates }),
    })
  }

  const toggleArrayParam = (
    key: 'color' | 'material',
    value: string,
  ) => {
    const current = asArray(search[key])
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value]
    // Un solo valor viaja como escalar para URLs canónicas; varios como array.
    setParam({ [key]: next.length === 1 ? next[0] : next } as Partial<ShopSearch>)
  }

  const activeFilterCount =
    asArray(search.color).length +
    asArray(search.material).length +
    (search.collection ? 1 : 0) +
    (search.sort ? 1 : 0)

  const title = category?.name ?? collection?.name ?? 'Todo el catálogo'
  const editorial = category?.editorial ?? collection?.description

  const filterPanel = (
    <div className="space-y-8">
      <FilterGroup title="Categoría">
        <ul className="space-y-2.5">
          <li>
            <button
              type="button"
              onClick={() => setParam({ category: undefined })}
              className={`text-sm transition-colors hover:text-taupe ${
                !search.category ? 'underline underline-offset-4' : ''
              }`}
            >
              Todo el catálogo
            </button>
          </li>
          {categories.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setParam({ category: c.id })}
                className={`text-sm transition-colors hover:text-taupe ${
                  search.category === c.id ? 'underline underline-offset-4' : ''
                }`}
              >
                {c.name}
              </button>
            </li>
          ))}
        </ul>
      </FilterGroup>

      <FilterGroup title="Colección">
        <ul className="space-y-2.5">
          {collections.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() =>
                  setParam({
                    collection: search.collection === c.id ? undefined : c.id,
                  })
                }
                className={`text-sm transition-colors hover:text-taupe ${
                  search.collection === c.id
                    ? 'underline underline-offset-4'
                    : ''
                }`}
              >
                {c.name}
              </button>
            </li>
          ))}
        </ul>
      </FilterGroup>

      <FilterGroup title="Color">
        <ul className="space-y-2.5">
          {facets.colors.map((c) => (
            <li key={c}>
              <label className="flex cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={asArray(search.color).includes(c)}
                  onChange={() => toggleArrayParam('color', c)}
                  className="h-3.5 w-3.5 appearance-none border border-clay checked:bg-ink"
                />
                {c}
              </label>
            </li>
          ))}
        </ul>
      </FilterGroup>

      <FilterGroup title="Material">
        <ul className="space-y-2.5">
          {facets.materials.map((m) => (
            <li key={m}>
              <label className="flex cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={asArray(search.material).includes(m)}
                  onChange={() => toggleArrayParam('material', m)}
                  className="h-3.5 w-3.5 appearance-none border border-clay checked:bg-ink"
                />
                {m}
              </label>
            </li>
          ))}
        </ul>
      </FilterGroup>

      <FilterGroup title="Precio">
        <ul className="space-y-2.5">
          {[
            { label: 'Hasta 300 €', priceMin: undefined, priceMax: 300 },
            { label: '300 – 600 €', priceMin: 300, priceMax: 600 },
            { label: '600 – 1.000 €', priceMin: 600, priceMax: 1000 },
            { label: 'Más de 1.000 €', priceMin: 1000, priceMax: undefined },
          ].map((r) => (
            <li key={r.label}>
              <button
                type="button"
                onClick={() =>
                  setParam({
                    category: search.category,
                    collection: search.collection,
                    color: search.color,
                    material: search.material,
                    sort: search.sort,
                    priceMin: r.priceMin,
                    priceMax: r.priceMax,
                  })
                }
                className="text-sm text-taupe hover:text-ink"
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      </FilterGroup>
    </div>
  )

  return (
    <div className="animate-fade-in">
      {/* Encabezado editorial */}
      <header className="border-b border-linen bg-sand px-4 py-14 md:px-8 md:py-20">
        <div className="mx-auto max-w-7xl">
          <p className="mb-2 label-wide tracking-[0.3em] text-taupe">
            Tienda
          </p>
          <h1 className="mb-3 font-serif text-4xl font-light md:text-5xl">
            {title}
          </h1>
          {editorial && (
            <p className="max-w-xl text-sm leading-relaxed text-taupe">
              {editorial}
            </p>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-10 md:px-8">
        {/* Barra de controles */}
        <div className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b border-linen pb-4">
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              className="label lg:hidden"
            >
              Filtros {activeFilterCount > 0 && `(${activeFilterCount})`}
            </button>
            <p className="text-sm text-taupe">
              {products.length}{' '}
              {products.length === 1 ? 'pieza' : 'piezas'}
            </p>
          </div>

          <label className="flex items-center gap-2 label">
            <span className="text-taupe">Ordenar por</span>
            <select
              value={search.sort ?? 'recommended'}
              onChange={(e) => setParam({ sort: e.target.value as SortId })}
              className="border-none bg-transparent py-1 pr-2 label outline-none"
            >
              {sorts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex gap-12">
          {/* Filtros desktop */}
          <aside className="hidden w-56 shrink-0 lg:block">
            {filterPanel}
          </aside>

          {/* Filtros mobile colapsables */}
          {filtersOpen && (
            <aside className="fixed inset-0 z-50 overflow-y-auto bg-ivory p-6 lg:hidden">
              <div className="mb-8 flex items-center justify-between">
                <span className="label-sm-wide">
                  Filtros
                </span>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="text-xl text-taupe"
                  aria-label="Cerrar filtros"
                >
                  ✕
                </button>
              </div>
              {filterPanel}
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className="mt-10 w-full bg-ink py-4 label-wide text-ivory"
              >
                Ver {products.length} piezas
              </button>
            </aside>
          )}

          {/* Grid */}
          <div className="min-w-0 flex-1">
            {products.length === 0 ? (
              <EmptyState
                title="Sin resultados"
                message="Ninguna pieza coincide con los filtros seleccionados. Pruebe a eliminar algún filtro."
              />
            ) : (
              <ProductGrid products={products} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function FilterGroup({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h3 className="mb-4 eyebrow">
        {title}
      </h3>
      {children}
    </section>
  )
}
