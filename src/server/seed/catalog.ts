/**
 * Semillas de catálogo para el servidor (plan.md §8.2: data → server/seed).
 *
 * Normalización aplicada (defectos D14/D15):
 * - cada color se convierte en una variante con SKU y stock propio;
 * - el stock del producto pasa a ser un agregado derivado;
 * - las categorías dejan de ser una union literal en los tipos.
 *
 * Mientras dura la migración strangler, las semillas extienden la forma
 * actual (ProductLike) para que la UI y los tests de caracterización sigan
 * funcionando sin cambios; en Fase 3 el modelo pasa a Product completo.
 */

import { queryProductsFrom, type CatalogFilters, type ProductLike } from '@/domain/catalog'
import { categories } from '../../data/categories'
import { collections } from '../../data/collections'
import { products } from '../../data/products'

export interface ProductVariantSeed {
  readonly id: string
  readonly sku: string
  readonly productId: string
  readonly color: string
  readonly price: number
  readonly stock: number
}

export interface ProductSeed extends ProductLike {
  readonly id: string
  readonly slug: string
  readonly collection: string
  readonly images: string[]
  readonly compareAtPrice?: number
  readonly variants: readonly ProductVariantSeed[]
  readonly stock: number
}

function slugToken(color: string): string {
  return color
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
}

// Reparto del stock del producto entre sus variantes de color de forma
// determinista (mismo resultado en cada arranque): la primera variante
// concentra el resto si la división no es exacta.
function buildVariants(p: {
  id: string
  slug: string
  price: number
  colors: string[]
  stock: number
}): ProductVariantSeed[] {
  const n = p.colors.length
  const base = n > 0 ? Math.floor(p.stock / n) : 0
  return p.colors.map((color, i) => ({
    id: `${p.id}-${slugToken(color)}`,
    sku: `${p.slug.toUpperCase()}-${slugToken(color).toUpperCase()}`,
    productId: p.id,
    color,
    price: p.price,
    stock: i === 0 ? p.stock - base * (n - 1) : base,
  }))
}

export const productSeeds: ProductSeed[] = products.map((p) => {
  const variants = buildVariants(p)
  return {
    ...p,
    variants,
    stock: variants.reduce((sum, v) => sum + v.stock, 0),
  }
})

export const categorySeeds = categories
export const collectionSeeds = collections

// ─── Fachada de repositorio (puerto CatalogRepository, adaptador in-memory) ──

export const catalogRepository = {
  search(filters: CatalogFilters): ProductLike[] {
    return queryProductsFrom(
      {
        products: productSeeds,
        collectionOf: (p) => (p as ProductSeed).collection,
      },
      filters,
    )
  },

  findBySlug(slug: string): ProductSeed | undefined {
    return productSeeds.find((p) => p.slug === slug)
  },

  findByIds(ids: string[]): ProductSeed[] {
    const set = new Set(ids)
    return productSeeds.filter((p) => set.has(p.id))
  },

  listCategories() {
    return categorySeeds
  },

  listCollections() {
    return collectionSeeds
  },

  listColors(): string[] {
    return [...new Set(productSeeds.flatMap((p) => p.colors))].sort()
  },

  listMaterials(): string[] {
    return [...new Set(productSeeds.flatMap((p) => p.materials))].sort()
  },

  /** Disponibilidad por SKU (defecto D14). */
  availability(skus: string[]): Record<string, number> {
    const bySku = new Map(
      productSeeds.flatMap((p) => p.variants.map((v) => [v.sku, v.stock] as const)),
    )
    const out: Record<string, number> = {}
    for (const sku of skus) out[sku] = bySku.get(sku) ?? 0
    return out
  },
}

export type CatalogRepository = typeof catalogRepository
