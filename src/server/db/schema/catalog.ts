/**
 * Dominio `catalog` — categorías, marcas, colecciones, productos, variantes y
 * media (plan 01 §4). Convenciones en `identity.ts` (cabecera).
 *
 * Invariantes cubiertas aquí:
 * - `products.slug` y `product_variants.sku` únicos (invariante §5.2).
 * - Un producto `active` obliga a tener `published_at` (no se publica a medias).
 * - `compare_at_price_cents` nunca es menor que `price_cents` (nada de
 *   "descuentos" negativos).
 * - `UNIQUE NULLS NOT DISTINCT(parent_id, slug)` y
 *   `(product_id, size, color)`: dos `NULL` no esquivan la unicidad.
 */

import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  char,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Árbol de categorías: la raíz tiene `parent_id IS NULL`. */
    parentId: uuid('parent_id').references((): AnyPgColumn => categories.id, {
      onDelete: 'restrict',
    }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    position: integer('position').notNull().default(0),
    status: text('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // NULLS NOT DISTINCT: dos categorías raíz con el mismo slug también chocan.
    unique('categories_parent_slug_key').on(t.parentId, t.slug).nullsNotDistinct(),
    index('categories_parent_position_idx').on(t.parentId, t.position),
    check('categories_slug_not_blank_check', sql`length(btrim(${t.slug})) > 0`),
    check('categories_position_check', sql`${t.position} >= 0`),
    check('categories_status_check', sql`${t.status} in ('draft', 'active', 'archived')`),
  ],
)

export const brands = pgTable(
  'brands',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    position: integer('position').notNull().default(0),
    status: text('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('brands_slug_key').on(t.slug),
    check('brands_slug_not_blank_check', sql`length(btrim(${t.slug})) > 0`),
    check('brands_position_check', sql`${t.position} >= 0`),
    check('brands_status_check', sql`${t.status} in ('draft', 'active', 'archived')`),
  ],
)

export const collections = pgTable(
  'collections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    position: integer('position').notNull().default(0),
    status: text('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('collections_slug_key').on(t.slug),
    check('collections_slug_not_blank_check', sql`length(btrim(${t.slug})) > 0`),
    check('collections_position_check', sql`${t.position} >= 0`),
    check('collections_status_check', sql`${t.status} in ('draft', 'active', 'archived')`),
  ],
)

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    shortDescription: text('short_description'),
    description: text('description'),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    brandId: uuid('brand_id').references(() => brands.id, { onDelete: 'restrict' }),
    collectionId: uuid('collection_id').references(() => collections.id, {
      onDelete: 'restrict',
    }),
    status: text('status').notNull().default('draft'),
    featured: boolean('featured').notNull().default(false),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    seoTitle: text('seo_title'),
    seoDescription: text('seo_description'),
    /** Borrado lógico: el histórico de pedidos sigue apuntando al producto. */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('products_slug_key').on(t.slug),
    // Catálogo público: sólo productos vivos, con su fecha de publicación.
    index('products_status_published_idx')
      .on(t.status, t.publishedAt)
      .where(sql`${t.deletedAt} is null`),
    index('products_category_id_idx').on(t.categoryId),
    index('products_brand_id_idx').on(t.brandId),
    index('products_collection_id_idx').on(t.collectionId),
    index('products_featured_idx')
      .on(t.featured)
      .where(sql`${t.featured} and ${t.deletedAt} is null`),
    // Búsqueda full-text (GIN + tsvector). `to_tsvector('simple', …)` es
    // IMMUTABLE, requisito de todo índice en PostgreSQL.
    index('products_search_idx').using(
      'gin',
      sql`to_tsvector('simple', coalesce(${t.name}, '') || ' ' || coalesce(${t.shortDescription}, '') || ' ' || coalesce(${t.description}, ''))`,
    ),
    check('products_slug_not_blank_check', sql`length(btrim(${t.slug})) > 0`),
    check('products_status_check', sql`${t.status} in ('draft', 'active', 'archived')`),
    check(
      'products_active_requires_published_at_check',
      sql`${t.status} <> 'active' or ${t.publishedAt} is not null`,
    ),
  ],
)

export const productVariants = pgTable(
  'product_variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    sku: text('sku').notNull(),
    size: text('size').notNull(),
    color: text('color').notNull(),
    /** Céntimos: entero, nunca decimal. */
    priceCents: bigint('price_cents', { mode: 'number' }).notNull(),
    /** Precio tachado; si existe, nunca por debajo del real. */
    compareAtPriceCents: bigint('compare_at_price_cents', { mode: 'number' }),
    currency: char('currency', { length: 3 }).notNull().default('EUR'),
    weightGrams: integer('weight_grams'),
    status: text('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('product_variants_sku_key').on(t.sku),
    // Un mismo color y talla no se repiten dentro del producto; NULLS NOT
    // DISTINCT evita que dos filas con la misma combinación se cuelen.
    unique('product_variants_product_size_color_key')
      .on(t.productId, t.size, t.color)
      .nullsNotDistinct(),
    index('product_variants_product_id_idx').on(t.productId),
    check('product_variants_sku_not_blank_check', sql`length(btrim(${t.sku})) > 0`),
    check('product_variants_price_cents_check', sql`${t.priceCents} >= 0`),
    check(
      'product_variants_compare_at_price_cents_check',
      sql`${t.compareAtPriceCents} is null or ${t.compareAtPriceCents} >= ${t.priceCents}`,
    ),
    check(
      'product_variants_weight_grams_check',
      sql`${t.weightGrams} is null or ${t.weightGrams} > 0`,
    ),
    check('product_variants_status_check', sql`${t.status} in ('draft', 'active', 'archived')`),
  ],
)

export const productMedia = pgTable(
  'product_media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Hijo propio del producto: se borra con él (CASCADE, §5.1).
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id').references(() => productVariants.id, {
      onDelete: 'cascade',
    }),
    /** Clave en el almacenamiento de objetos; nunca una URL efímera. */
    storageKey: text('storage_key').notNull(),
    /** Texto alternativo obligatorio y no vacío (accesibilidad). */
    alt: text('alt').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    type: text('type').notNull().default('image'),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('product_media_product_position_idx').on(t.productId, t.position),
    index('product_media_variant_id_idx').on(t.variantId),
    uniqueIndex('product_media_storage_key_key').on(t.storageKey),
    check('product_media_alt_not_blank_check', sql`length(btrim(${t.alt})) > 0`),
    check('product_media_dimensions_check', sql`${t.width} > 0 and ${t.height} > 0`),
    check('product_media_position_check', sql`${t.position} >= 0`),
    check('product_media_type_check', sql`${t.type} in ('image', 'video')`),
  ],
)
