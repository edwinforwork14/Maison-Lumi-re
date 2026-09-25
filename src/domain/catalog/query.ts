/**
 * Consulta de catálogo como funciones puras (plan.md Fase 1, domain/catalog).
 *
 * Recibe los datos por parámetro: no importa mocks ni conoce React.
 * Es la fuente única de filtrado y ordenado del catálogo; el doble
 * ordenamiento que existía entre shop.tsx y data/index.ts (defecto D3)
 * desaparece porque ahora solo existe este pipeline.
 */

export const SORT_IDS = [
  'recommended',
  'price-asc',
  'price-desc',
  'bestsellers',
  'new',
] as const

export type SortId = (typeof SORT_IDS)[number]

export interface ProductLike {
  name: string
  description: string
  category: string
  /** Precio en céntimos (unidades menores), nunca euros decimales. */
  priceCents: number
  colors: string[]
  materials: string[]
  featured: boolean
  bestseller: boolean
  isNew: boolean
}

export interface CatalogFilters {
  category?: string
  collection?: string
  colors?: string[]
  materials?: string[]
  /** Cota inferior del precio, en céntimos. */
  priceMinCents?: number
  /** Cota superior del precio, en céntimos. */
  priceMaxCents?: number
  sort?: SortId
  search?: string
}

export interface CatalogSource {
  products: ProductLike[]
  collectionOf: (p: ProductLike) => string | undefined
}

export function sortProducts<T extends ProductLike>(
  list: T[],
  sort: SortId = 'recommended',
): T[] {
  const sorted = [...list]
  switch (sort) {
    case 'price-asc':
      return sorted.sort((a, b) => a.priceCents - b.priceCents)
    case 'price-desc':
      return sorted.sort((a, b) => b.priceCents - a.priceCents)
    case 'bestsellers':
      return sorted.sort((a, b) => Number(b.bestseller) - Number(a.bestseller))
    case 'new':
      return sorted.sort((a, b) => Number(b.isNew) - Number(a.isNew))
    default:
      return sorted.sort(
        (a, b) =>
          Number(b.featured) - Number(a.featured) ||
          Number(b.bestseller) - Number(a.bestseller),
      )
  }
}

export function queryProductsFrom(
  source: CatalogSource,
  filters: CatalogFilters,
): ProductLike[] {
  let list = source.products

  if (filters.category) {
    list = list.filter((p) => p.category === filters.category)
  }
  if (filters.collection) {
    list = list.filter((p) => source.collectionOf(p) === filters.collection)
  }
  if (filters.colors?.length) {
    const wanted = filters.colors
    list = list.filter((p) => p.colors.some((c) => wanted.includes(c)))
  }
  if (filters.materials?.length) {
    const wanted = filters.materials
    list = list.filter((p) => p.materials.some((m) => wanted.includes(m)))
  }
  if (filters.priceMinCents != null) {
    list = list.filter((p) => p.priceCents >= filters.priceMinCents!)
  }
  if (filters.priceMaxCents != null) {
    list = list.filter((p) => p.priceCents <= filters.priceMaxCents!)
  }
  if (filters.search) {
    const q = filters.search.toLowerCase().trim()
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.category.includes(q),
      )
    }
  }

  // Una sola pasada de ordenado (defecto D3): el llamador no reordena.
  return sortProducts(list, filters.sort)
}
