// Tipos del catálogo. Procedentes de `src/data/types.ts` (migración strangler
// Plan 03 §5): las rutas y componentes importan desde aquí, nunca desde `@/data`.
//
// REGLA DE DINERO: todo importe es un entero en **céntimos** (`priceCents`),
// nunca euros decimales. El formateo es responsabilidad de `lib/money-format`
// y la aritmética de `domain/money` (defectos D17/D21).

export interface Product {
  id: string
  name: string
  slug: string
  description: string
  /** Precio en céntimos. */
  priceCents: number
  /** Precio tachado en céntimos, si lo hay. */
  compareAtPriceCents?: number
  category: CategoryId
  collection: CollectionId
  colors: string[]
  materials: string[]
  images: string[]
  stock: number
  featured: boolean
  bestseller: boolean
  isNew: boolean
}

/**
 * Los identificadores de categoría y colección son **datos**
 * (`data/categories.ts`, `data/collections.ts`), no un union literal en el tipo
 * (defecto D15): añadir una categoría no obliga a tocar código.
 * La integridad referencial la garantiza `tests/seeds.test.ts`.
 */
export type CategoryId = string
export type CollectionId = string

export interface Category {
  id: CategoryId
  name: string
  slug: string
  description: string
  editorial: string
}

export interface Collection {
  id: CollectionId
  name: string
  slug: string
  description: string
}
