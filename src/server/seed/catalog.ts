/**
 * Semillas de catálogo para el servidor (plan.md §8.2: data → server/seed).
 *
 * Normalización aplicada (defectos D14/D15/D21):
 * - cada color se convierte en una variante con SKU, precio y stock propios;
 * - el stock del producto pasa a ser un agregado derivado de sus variantes;
 * - los precios viven en **céntimos** (`priceCents`), nunca en euros decimales.
 *
 * Mientras dura la migración strangler, las semillas extienden la forma actual
 * (ProductLike) para que la UI y los tests de caracterización sigan funcionando
 * sin cambios; en Fase 3 el modelo pasa a Product completo.
 */

import {
  queryProductsFrom,
  type CatalogFilters,
  type ProductLike,
} from '../../domain/catalog/query.ts'
import { categories } from '../../data/categories.ts'
import { collections } from '../../data/collections.ts'
import { products } from '../../data/products.ts'

export interface ProductVariantSeed {
  readonly id: string
  readonly sku: string
  readonly productId: string
  readonly color: string
  /** Precio de la variante en céntimos. */
  readonly priceCents: number
  readonly stock: number
}

export interface ProductSeed extends ProductLike {
  readonly id: string
  readonly slug: string
  readonly collection: string
  readonly images: string[]
  readonly compareAtPriceCents?: number
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
  priceCents: number
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
    priceCents: p.priceCents,
    stock: i === 0 ? p.stock - base * (n - 1) : base,
  }))
}

export const productSeeds: ProductSeed[] = products.map((p) => {
  const variants = buildVariants(p)
  return {
    ...p,
    variants,
    stock: variants.reduce((total, v) => total + v.stock, 0),
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

  /** Variante concreta de un producto por color (clave del carrito). */
  findVariant(productId: string, color: string): ProductVariantSeed | undefined {
    const product = productSeeds.find((p) => p.id === productId)
    return product?.variants.find((v) => v.color === color)
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
