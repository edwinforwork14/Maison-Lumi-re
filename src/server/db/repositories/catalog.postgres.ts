/**
 * Catálogo del storefront sobre PostgreSQL (Fase 3 del Plan 03).
 *
 * Devuelve la MISMA forma que el catálogo en memoria (`Product` de
 * `data/types`), así que la UI no cambia: el adaptador traduce filas a la
 * estructura que ya consumen las plantillas y el pipeline de filtrado/ordenado
 * del dominio.
 *
 * Decisiones que conviene conocer:
 * - Se leen los productos **activos** y el filtrado/ordenado se sigue haciendo
 *   en el dominio sobre el conjunto completo. Con 28 productos es lo correcto;
 *   con miles habría que empujar los filtros a SQL (documentado como deuda).
 * - `category` y `collection` se exponen como **slug**, porque es lo que viaja
 *   en la URL (`?category=eyewear`).
 * - `bestseller` se deriva de las unidades vendidas y `isNew` de la fecha de
 *   publicación: el esquema no guarda esos dos indicadores como columnas.
 */

import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type {
  Category,
  Collection,
  Product,
} from '../../../data/types.ts'
import type { ProductVariantSeed } from '../../seed/catalog.ts'
import { getDb, type Database } from '../client.ts'
import { inventoryItems } from '../schema/inventory.ts'
import {
  categories as categoriesTable,
  collections as collectionsTable,
  productMedia,
  productVariants,
  products as productsTable,
} from '../schema/catalog.ts'
import type { CatalogFilters, ProductLike } from '../../../domain/catalog/query.ts'

/** Un producto tal como lo consume la tienda, con sus variantes. */
export interface CatalogProduct extends Product {
  readonly variants: readonly ProductVariantSeed[]
}

const NEW_WINDOW_DAYS = 180

function isNew(publishedAt: Date | null, now = new Date()): boolean {
  if (!publishedAt) return false
  const days = (now.getTime() - publishedAt.getTime()) / (24 * 60 * 60 * 1_000)
  return days <= NEW_WINDOW_DAYS
}

export interface PostgresCatalogRepository {
  /** Productos activos; el filtrado y el orden los aplica el dominio. */
  listAll(): Promise<CatalogProduct[]>
  findBySlug(slug: string): Promise<CatalogProduct | undefined>
  findByIds(ids: readonly string[]): Promise<CatalogProduct[]>
  listCategories(): Promise<Category[]>
  listCollections(): Promise<Collection[]>
  listColors(): Promise<string[]>
  listMaterials(): Promise<string[]>
  /** Igual que la fachada en memoria: aplica el pipeline del dominio. */
  search(filters: CatalogFilters): Promise<CatalogProduct[]>
}

export function createPostgresCatalogRepository(
  db: Database = getDb(),
): PostgresCatalogRepository {
  async function hydrate(productIds: readonly string[]): Promise<CatalogProduct[]> {
    if (productIds.length === 0) return []

    const rows = await db
      .select({
        id: productsTable.id,
        slug: productsTable.slug,
        name: productsTable.name,
        description: productsTable.description,
        shortDescription: productsTable.shortDescription,
        featured: productsTable.featured,
        publishedAt: productsTable.publishedAt,
        materials: productsTable.materials,
        categorySlug: categoriesTable.slug,
        collectionSlug: collectionsTable.slug,
        seoTitle: productsTable.seoTitle,
        seoDescription: productsTable.seoDescription,
      })
      .from(productsTable)
      .leftJoin(categoriesTable, eq(categoriesTable.id, productsTable.categoryId))
      .leftJoin(collectionsTable, eq(collectionsTable.id, productsTable.collectionId))
      .where(
        and(
          inArray(productsTable.id, [...productIds]),
          eq(productsTable.status, 'active'),
          sql`${productsTable.deletedAt} is null`,
        ),
      )
      .orderBy(asc(productsTable.name))

    if (rows.length === 0) return []
    const ids = rows.map((row) => row.id)

    const variantRows = await db
      .select({
        id: productVariants.id,
        productId: productVariants.productId,
        sku: productVariants.sku,
        color: productVariants.color,
        priceCents: productVariants.priceCents,
        onHand: inventoryItems.onHand,
        reserved: inventoryItems.reserved,
      })
      .from(productVariants)
      .leftJoin(inventoryItems, eq(inventoryItems.variantId, productVariants.id))
      .where(and(inArray(productVariants.productId, ids), eq(productVariants.status, 'active')))
      .orderBy(asc(productVariants.color))

    const mediaRows = await db
      .select({
        productId: productMedia.productId,
        storageKey: productMedia.storageKey,
        position: productMedia.position,
      })
      .from(productMedia)
      .where(inArray(productMedia.productId, ids))
      .orderBy(asc(productMedia.position))

    // Unidades vendidas: el esquema no guarda «bestseller», se deriva del dato real.
    const soldRows = await db
      .select({
        productId: productVariants.productId,
        units: sql<number>`coalesce(sum(oi.quantity), 0)::int`,
      })
      .from(productVariants)
      .leftJoin(sql`order_items oi`, sql`oi.variant_id = ${productVariants.id}`)
      .where(inArray(productVariants.productId, ids))
      .groupBy(productVariants.productId)

    const variantsByProduct = new Map<string, ProductVariantSeed[]>()
    for (const variant of variantRows) {
      const list = variantsByProduct.get(variant.productId) ?? []
      list.push({
        id: variant.id,
        sku: variant.sku,
        productId: variant.productId,
        color: variant.color,
        priceCents: variant.priceCents,
        stock: Math.max(0, (variant.onHand ?? 0) - (variant.reserved ?? 0)),
      })
      variantsByProduct.set(variant.productId, list)
    }

    const imagesByProduct = new Map<string, string[]>()
    for (const media of mediaRows) {
      const list = imagesByProduct.get(media.productId) ?? []
      list.push(media.storageKey)
      imagesByProduct.set(media.productId, list)
    }

    const soldByProduct = new Map(soldRows.map((row) => [row.productId, Number(row.units)]))

    return rows.map((row) => {
      const variants = variantsByProduct.get(row.id) ?? []
      const prices = variants.map((variant) => variant.priceCents)
      const stock = variants.reduce((total, variant) => total + variant.stock, 0)
      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description ?? row.shortDescription ?? '',
        priceCents: prices.length > 0 ? Math.min(...prices) : 0,
        category: row.categorySlug ?? '',
        collection: row.collectionSlug ?? '',
        colors: [...new Set(variants.map((variant) => variant.color))],
        materials: row.materials ?? [],
        images: imagesByProduct.get(row.id) ?? [],
        stock,
        featured: row.featured,
        bestseller: (soldByProduct.get(row.id) ?? 0) > 0,
        isNew: isNew(row.publishedAt),
        variants,
      } satisfies CatalogProduct
    })
  }

  async function allActiveIds(): Promise<string[]> {
    const rows = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(and(eq(productsTable.status, 'active'), sql`${productsTable.deletedAt} is null`))
      .orderBy(asc(productsTable.name))
    return rows.map((row) => row.id)
  }

  return {
    async listAll() {
      return hydrate(await allActiveIds())
    },

    async findBySlug(slug) {
      const [row] = await db
        .select({ id: productsTable.id })
        .from(productsTable)
        .where(and(eq(productsTable.slug, slug), eq(productsTable.status, 'active')))
        .limit(1)
      if (!row) return undefined
      return (await hydrate([row.id]))[0]
    },

    async findByIds(ids) {
      return hydrate(ids)
    },

    async listCategories() {
      const rows = await db
        .select()
        .from(categoriesTable)
        .where(eq(categoriesTable.status, 'active'))
        .orderBy(asc(categoriesTable.position))
      return rows.map((row) => ({
        // El id que viaja en la URL es el slug de la categoría.
        id: row.slug,
        slug: row.slug,
        name: row.name,
        description: row.description ?? '',
        editorial: row.description ?? '',
      }))
    },

    async listCollections() {
      const rows = await db
        .select()
        .from(collectionsTable)
        .orderBy(asc(collectionsTable.position))
      return rows.map((row) => ({
        id: row.slug,
        slug: row.slug,
        name: row.name,
        description: row.description ?? '',
      }))
    },

    async listColors() {
      const rows = await db
        .selectDistinct({ color: productVariants.color })
        .from(productVariants)
        .innerJoin(productsTable, eq(productsTable.id, productVariants.productId))
        .where(and(eq(productVariants.status, 'active'), eq(productsTable.status, 'active')))
      return rows.map((row) => row.color).sort()
    },

    async listMaterials() {
      const rows = await db
        .select({ material: sql<string>`unnest(${productsTable.materials})` })
        .from(productsTable)
        .where(eq(productsTable.status, 'active'))
      return [...new Set(rows.map((row) => row.material))].filter(Boolean).sort()
    },

    async search(filters) {
      const { queryProductsFrom } = await import('../../../domain/catalog/query.ts')
      const all = await hydrate(await allActiveIds())
      return queryProductsFrom(
        {
          products: all as unknown as ProductLike[],
          collectionOf: (product) => (product as ProductLike as CatalogProduct).collection,
        },
        filters,
      ) as unknown as CatalogProduct[]
    },
  }
}
