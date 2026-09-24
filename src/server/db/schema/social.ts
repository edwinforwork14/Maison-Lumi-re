/**
 * Dominio `social` — reseñas y listas de deseos (plan 01 §4).
 * Convenciones en `identity.ts` (cabecera).
 *
 * Invariantes cubiertas aquí:
 * - `UNIQUE(order_item_id)`: una reseña por **línea comprada** — sólo reseña
 *   quien compró, y sólo una vez (nada de reseñas infladas).
 * - `rating BETWEEN 1 AND 5` y moderación explícita (`status`, `moderated_by`).
 * - Índice parcial sobre `product_id WHERE status = 'approved'`: la ficha de
 *   producto sólo lee reseñas publicadas.
 */

import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { productVariants, products } from './catalog.ts'
import { customers, users } from './identity.ts'
import { orderItems } from './orders.ts'

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    customerId: uuid('customer_id').references(() => customers.id, {
      onDelete: 'restrict',
    }),
    /** Línea de pedido que autoriza la reseña (compra verificada). */
    orderItemId: uuid('order_item_id')
      .notNull()
      .references(() => orderItems.id, { onDelete: 'restrict' }),
    rating: integer('rating').notNull(),
    title: text('title'),
    body: text('body'),
    status: text('status').notNull().default('pending'),
    moderatedBy: uuid('moderated_by').references(() => users.id, { onDelete: 'restrict' }),
    moderatedAt: timestamp('moderated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('reviews_order_item_id_key').on(t.orderItemId),
    index('reviews_product_id_idx')
      .on(t.productId)
      .where(sql`${t.status} = 'approved'`),
    index('reviews_status_idx').on(t.status),
    index('reviews_customer_id_idx').on(t.customerId),
    check('reviews_rating_check', sql`${t.rating} between 1 and 5`),
    check('reviews_status_check', sql`${t.status} in ('pending', 'approved', 'rejected')`),
  ],
)

export const wishlists = pgTable(
  'wishlists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** Una lista por usuario (la "lista de deseos" del storefront). */
    name: text('name').notNull().default('default'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('wishlists_user_id_key').on(t.userId),
    check('wishlists_name_not_blank_check', sql`length(btrim(${t.name})) > 0`),
  ],
)

export const wishlistItems = pgTable(
  'wishlist_items',
  {
    // Hijo propio de la lista: se borra con ella (CASCADE, §5.1).
    wishlistId: uuid('wishlist_id')
      .notNull()
      .references(() => wishlists.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'wishlist_items_pk', columns: [t.wishlistId, t.variantId] }),
    index('wishlist_items_variant_id_idx').on(t.variantId),
  ],
)
