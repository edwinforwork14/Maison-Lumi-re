import { products } from './products'
import { categories, categoryMap } from './categories'
import { collections, collectionMap } from './collections'
import {
  shippingMethods,
  freeShippingThreshold,
  shippingCostFor,
} from './shipping'
import type {
  CategoryId,
  CollectionId,
  Product,
  ShippingMethodId,
} from './types'

export * from './types'
export { categories, categoryMap, collections, collectionMap, shippingMethods, freeShippingThreshold, shippingCostFor }

export type SortId =
  | 'recommended'
  | 'price-asc'
  | 'price-desc'
  | 'bestsellers'
  | 'new'

export const allColors = [...new Set(products.flatMap((p) => p.colors))].sort()
export const allMaterials = [
  ...new Set(products.flatMap((p) => p.materials)),
].sort()

export interface CatalogFilters {
  category?: CategoryId
  collection?: CollectionId
  colors?: string[]
  materials?: string[]
  priceMin?: number
  priceMax?: number
  sort?: SortId
  search?: string
}

export function sortProducts(list: Product[], sort: SortId = 'recommended') {
  const sorted = [...list]
  switch (sort) {
    case 'price-asc':
      return sorted.sort((a, b) => a.price - b.price)
    case 'price-desc':
      return sorted.sort((a, b) => b.price - a.price)
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

export function queryProducts(filters: CatalogFilters): Product[] {
  let list = products

  if (filters.category) {
    list = list.filter((p) => p.category === filters.category)
  }
  if (filters.collection) {
    list = list.filter((p) => p.collection === filters.collection)
  }
  if (filters.colors?.length) {
    list = list.filter((p) => p.colors.some((c) => filters.colors!.includes(c)))
  }
  if (filters.materials?.length) {
    list = list.filter((p) =>
      p.materials.some((m) => filters.materials!.includes(m)),
    )
  }
  if (filters.priceMin != null) {
    list = list.filter((p) => p.price >= filters.priceMin!)
  }
  if (filters.priceMax != null) {
    list = list.filter((p) => p.price <= filters.priceMax!)
  }
  if (filters.search) {
    const q = filters.search.toLowerCase().trim()
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.includes(q),
    )
  }

  return sortProducts(list, filters.sort)
}

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug)
}

export function getRelatedProducts(product: Product, limit = 4): Product[] {
  return products
    .filter((p) => p.id !== product.id && p.category === product.category)
    .slice(0, limit)
}

export function getFeaturedProducts(limit = 8): Product[] {
  return sortProducts(
    products.filter((p) => p.featured),
    'recommended',
  ).slice(0, limit)
}

export function getNewArrivals(limit = 4): Product[] {
  return sortProducts(products, 'new').slice(0, limit)
}
