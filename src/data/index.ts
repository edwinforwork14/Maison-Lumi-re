import { products } from './products'
import { categories, categoryMap } from './categories'
import { collections, collectionMap } from './collections'
import {
  shippingMethods,
  freeShippingThreshold,
  shippingCostFor,
} from './shipping'
import type { CategoryId, CollectionId, Product } from './types'
import {
  sortProducts,
  queryProductsFrom,
  type CatalogFilters,
  type CatalogSource,
} from '@/domain/catalog'

export * from './types'
export {
  categories,
  categoryMap,
  collections,
  collectionMap,
  shippingMethods,
  freeShippingThreshold,
  shippingCostFor,
}

export type { SortId } from '@/domain/catalog'
export {
  sortProducts,
  queryProductsFrom,
  type CatalogFilters,
} from '@/domain/catalog'

export const allColors = [...new Set(products.flatMap((p) => p.colors))].sort()
export const allMaterials = [
  ...new Set(products.flatMap((p) => p.materials)),
].sort()

const catalogSource: CatalogSource = {
  products,
  collectionOf: (p) => (p as Product).collection,
}

/**
 * Fachada del catálogo: delega el filtrado y el ordenado en domain/catalog
 * (una sola pasada de ordenado, defecto D3) y mantiene la API que consumen
 * los componentes mientras dura la migración (plan.md §11, estrategia strangler).
 */
export function queryProducts(filters: CatalogFilters): Product[] {
  return queryProductsFrom(catalogSource, filters) as Product[]
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
