import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  createFileRoute,
  useSearch,
  useNavigate,
} from '@tanstack/react-router'
import { z } from 'zod'
import { listProducts, listCategories, listCollections, listFacets } from '@/features/commerce.api'
import { centsOfMajor } from '@/lib/money-format'
import { SORT_IDS } from '@/domain/catalog'
import { ProductGrid } from '@/components/product/ProductGrid'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Breadcrumb, type Crumb } from '@/components/ui/Breadcrumb'
import { queryKeys } from '@/features/model/queries'
import { PlpEditorial } from '@/components/plp/PlpEditorial'
import { PlpIsland } from '@/components/plp/PlpIsland'
import { PlpFilterModal } from '@/components/plp/PlpFilterModal'
import { SubcategoryModal } from '@/components/plp/SubcategoryModal'
import { ResultsCount } from '@/components/plp/ResultsCount'

/**
 * PLP (Plan 04 F4). La vista se replica de la referencia —banner a sangre,
 * bloque editorial, isla flotante, rejilla a sangre, contador y migas al
 * final—, pero la lógica queda intacta (frontera §10): `validateSearch`
 * (Zod), `loader`, `useQuery` y la función `setParam` que escribe en la URL.
 */
export interface ShopSearch {
  category?: string
  collection?: string
  /** Escalar con un valor (URL canónica) o array JSON con varios. */
  color?: string | string[]
  material?: string | string[]
  priceMin?: number
  priceMax?: number
  sort?: (typeof SORT_IDS)[number]
}

/** Normaliza el valor de search (escalar o array) a lista. */
const asArray = (v: string | string[] | undefined): string[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v]

/**
 * Filtros de la URL validados con Zod (Plan 03 §9): una URL inválida
 * degrada campo a campo vía `.catch()`, nunca devuelve un catálogo vacío mudo.
 * La URL viaja en euros (legible y canónica); la API habla céntimos.
 */
const listParam = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .catch(undefined)

const priceParam = z.coerce.number().nonnegative().optional().catch(undefined)

const shopSearchSchema = z.object({
  category: z.string().min(1).optional().catch(undefined),
  collection: z.string().min(1).optional().catch(undefined),
  color: listParam,
  material: listParam,
  priceMin: priceParam,
  priceMax: priceParam,
  sort: z.enum(SORT_IDS).optional().catch(undefined),
})

export const Route = createFileRoute('/_storefront/shop')({
  validateSearch: (search: Record<string, unknown>): ShopSearch =>
    shopSearchSchema.parse(search),
  head: () => ({
    meta: [
      { title: 'Tienda — Maison Lumière' },
      {
        name: 'description',
        content:
          'Catálogo completo de Maison Lumière: gafas, bolsos, zapatos y accesorios.',
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
    <div aria-busy="true" className="grid grid-cols-2 md:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i}>
          <div className="skeleton aspect-3/4 w-full" />
          <div className="space-y-3 px-5 pb-8 pt-3">
            <div className="skeleton h-4 w-3/4" />
            <div className="skeleton h-4 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

function ShopPage() {
  const search = useSearch({ from: '/_storefront/shop' })
  const navigate = useNavigate()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [subcatsOpen, setSubcatsOpen] = useState(false)
  const loaderData = Route.useLoaderData()

  const {
    data: filtered,
    isPending: isFiltering,
    isError: isFilterError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.products(
      search.category,
      search.collection,
      search.color,
      search.material,
      search.priceMin,
      search.priceMax,
      search.sort,
    ),
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

  const products = filtered ?? []
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

  const clearFilters = () => {
    setParam({
      category: undefined,
      collection: undefined,
      color: undefined,
      material: undefined,
      priceMin: undefined,
      priceMax: undefined,
      sort: undefined,
    })
  }

  const activeFilterCount =
    asArray(search.color).length +
    asArray(search.material).length +
    (search.category ? 1 : 0) +
    (search.collection ? 1 : 0)

  const hasActiveFilters = activeFilterCount > 0
  const title = category?.name ?? collection?.name ?? 'Todo el catálogo'
  const editorial = category?.editorial ?? collection?.description

  const middleCrumbs: Crumb[] = hasActiveFilters
    ? [{ label: 'Tienda', linkProps: { to: '/shop' } }]
    : []
  const breadcrumbItems: Crumb[] = [
    { label: 'Inicio', linkProps: { to: '/' } },
    ...middleCrumbs,
    { label: title },
  ]

  return (
    <div className="animate-fade-in">
      {/* Banner a sangre + bloque editorial (§2.4–2.5) */}
      <PlpEditorial
        title={title}
        description={editorial}
        bannerSrc={loaderData.products[0]?.images[0]}
      />

      {/* Rejilla a sangre (§2.7): «cargando» ≠ «no hay nada» (D35) */}
      {isFiltering ? (
        <ShopSkeleton />
      ) : isFilterError ? (
        <ErrorState
          title="No hemos podido cargar las piezas"
          message="Vuelva a intentarlo en un momento."
          onRetry={() => void refetch()}
        />
      ) : products.length === 0 ? (
        <EmptyState
          title="Sin resultados"
          message="Ninguna pieza coincide con los filtros seleccionados. Pruebe a eliminar algún filtro."
        />
      ) : (
        <ProductGrid products={products} />
      )}

      {!isFiltering && !isFilterError && (
        <ResultsCount visible={products.length} total={loaderData.products.length} />
      )}

      {/* Migas de pan al FINAL de la página (§2.14) */}
      <div className="mx-auto max-w-7xl px-5 py-12 md:px-10">
        <Breadcrumb items={breadcrumbItems} />
      </div>

      {/* Isla flotante (§2.6) */}
      <PlpIsland
        categoryLabel={title}
        filterCount={activeFilterCount}
        onOpenCategories={() => setSubcatsOpen(true)}
        onOpenFilters={() => setFiltersOpen(true)}
      />

      {/* Filtros y orden (§2.9) */}
      <PlpFilterModal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={search}
        categories={categories}
        collections={collections}
        facets={facets}
        resultCount={products.length}
        activeFilterCount={activeFilterCount}
        setParam={setParam}
        toggleArrayParam={toggleArrayParam}
        clearFilters={clearFilters}
      />

      {/* Subcategorías (§2.10) */}
      <SubcategoryModal
        open={subcatsOpen}
        onClose={() => setSubcatsOpen(false)}
        title="Categorías"
        categories={categories}
      />
    </div>
  )
}
