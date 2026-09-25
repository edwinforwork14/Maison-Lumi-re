/**
 * Wishlist y reseñas del storefront (Plan 03, S3).
 *
 * - **Wishlist en servidor.** El navegador sólo guarda una caché optimista de
 *   ids; la verdad está en `wishlists`/`wishlist_items`, así que la lista sigue
 *   al cliente en cualquier dispositivo y no vive en `localStorage` (D38).
 * - **Reseñas sólo tras la entrega.** Quien reseña debe tener una línea de
 *   pedido propia cuyo pedido esté `fulfilled`, y una sola reseña por línea
 *   (`UNIQUE(order_item_id)`). Nace en `pending`: sólo `approved` se publica.
 */

import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { getDb, type Database } from '../db/client.ts'
import { productVariants, products } from '../db/schema/catalog.ts'
import { orderItems, orders } from '../db/schema/orders.ts'
import { customers } from '../db/schema/identity.ts'
import { reviews, wishlists, wishlistItems } from '../db/schema/social.ts'
import { AppError } from '../errors.ts'

// ─── Wishlist ───────────────────────────────────────────────────────────────

/** Id de la lista del usuario; se crea perezosamente en el primer guardado. */
async function ensureWishlist(userId: string, db: Database): Promise<string> {
  const [existing] = await db
    .select({ id: wishlists.id })
    .from(wishlists)
    .where(eq(wishlists.userId, userId))
    .limit(1)
  if (existing) return existing.id

  const [created] = await db
    .insert(wishlists)
    .values({ userId })
    .onConflictDoNothing({ target: wishlists.userId })
    .returning({ id: wishlists.id })
  if (created) return created.id

  const [row] = await db
    .select({ id: wishlists.id })
    .from(wishlists)
    .where(eq(wishlists.userId, userId))
    .limit(1)
  return row!.id
}

/**
 * La wishlist guarda **variantes** (es lo que la base permite), pero la UI
 * piensa en productos: se elige la variante canónica de cada producto (la
 * primera activa por precio) y se mapea de vuelta al producto al leer.
 */
async function canonicalVariantId(productId: string, db: Database): Promise<string | null> {
  const [row] = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(and(eq(productVariants.productId, productId), eq(productVariants.status, 'active')))
    .orderBy(asc(productVariants.priceCents), asc(productVariants.id))
    .limit(1)
  return row?.id ?? null
}

export async function listWishlistProductIds(
  userId: string,
  db: Database = getDb(),
): Promise<string[]> {
  const listId = await ensureWishlist(userId, db)
  const rows = await db
    .select({ productId: productVariants.productId })
    .from(wishlistItems)
    .innerJoin(productVariants, eq(productVariants.id, wishlistItems.variantId))
    .where(eq(wishlistItems.wishlistId, listId))
    .orderBy(asc(wishlistItems.createdAt))
  return [...new Set(rows.map((row) => row.productId))]
}

export async function toggleWishlistProduct(
  userId: string,
  productId: string,
  db: Database = getDb(),
): Promise<{ active: boolean; productIds: string[] }> {
  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), sql`${products.deletedAt} is null`))
    .limit(1)
  if (!product) throw new AppError('NOT_FOUND', 'Producto no encontrado')

  const listId = await ensureWishlist(userId, db)
  const variantId = await canonicalVariantId(productId, db)
  if (!variantId) {
    throw new AppError('CONFLICT', 'Ese producto no tiene variantes disponibles')
  }

  const [existing] = await db
    .select({ variantId: wishlistItems.variantId })
    .from(wishlistItems)
    .where(and(eq(wishlistItems.wishlistId, listId), eq(wishlistItems.variantId, variantId)))
    .limit(1)

  if (existing) {
    await db
      .delete(wishlistItems)
      .where(and(eq(wishlistItems.wishlistId, listId), eq(wishlistItems.variantId, variantId)))
    return { active: false, productIds: await listWishlistProductIds(userId, db) }
  }

  await db
    .insert(wishlistItems)
    .values({ wishlistId: listId, variantId })
    .onConflictDoNothing()
  return { active: true, productIds: await listWishlistProductIds(userId, db) }
}

// ─── Reseñas ────────────────────────────────────────────────────────────────

export interface ProductReview {
  readonly id: string
  readonly rating: number
  readonly title: string | null
  readonly body: string | null
  readonly createdAt: string
  /** Sólo el nombre: la reseña pública nunca expone el email del comprador. */
  readonly author: string | null
}

/** Reseñas públicas: únicamente las aprobadas (índice parcial en la base). */
export async function listProductReviews(
  productId: string,
  db: Database = getDb(),
): Promise<ProductReview[]> {
  const rows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      title: reviews.title,
      body: reviews.body,
      createdAt: reviews.createdAt,
      firstName: customers.firstName,
    })
    .from(reviews)
    .leftJoin(customers, eq(customers.id, reviews.customerId))
    .where(and(eq(reviews.productId, productId), eq(reviews.status, 'approved')))
    .orderBy(desc(reviews.createdAt))
    .limit(50)

  return rows.map((row) => ({
    id: row.id,
    rating: row.rating,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    author: row.firstName,
  }))
}

export interface CreateReviewInput {
  readonly userId: string
  readonly email: string
  readonly productId: string
  readonly orderItemId: string
  readonly rating: number
  readonly title?: string | null
  readonly body?: string | null
  /** Se rellena si el comprador tiene ficha de cliente (no es obligatorio). */
  readonly customerId?: string | null
}

/**
 * Crea una reseña. Comprueba en SQL que la línea es del titular, que pertenece
 * a este producto y que el pedido está entregado: sin eso no hay reseña, venga
 * de donde venga la llamada.
 */
export async function createProductReview(
  input: CreateReviewInput,
  db: Database = getDb(),
): Promise<{ id: string; status: string }> {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new AppError('VALIDATION', 'La nota debe estar entre 1 y 5')
  }

  const [line] = await db
    .select({
      id: orderItems.id,
      status: orders.status,
      productId: productVariants.productId,
      ownerEmail: orders.email,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(productVariants, eq(productVariants.id, orderItems.variantId))
    .where(eq(orderItems.id, input.orderItemId))
    .limit(1)

  if (!line) throw new AppError('NOT_FOUND', 'No encontramos esa línea de pedido')
  if (line.ownerEmail.trim().toLowerCase() !== input.email.trim().toLowerCase()) {
    // No se confirma siquiera que exista: la compra de otro no es consultable.
    throw new AppError('FORBIDDEN', 'Sólo puede reseñar quien compró el producto')
  }
  if (line.productId !== input.productId) {
    throw new AppError('VALIDATION', 'Esa línea de pedido no corresponde a este producto')
  }
  if (line.status !== 'fulfilled') {
    throw new AppError('VALIDATION', 'Sólo se reseña lo que ya ha sido entregado')
  }

  try {
    const [created] = await db
      .insert(reviews)
      .values({
        productId: input.productId,
        customerId: input.customerId ?? null,
        orderItemId: input.orderItemId,
        rating: input.rating,
        title: input.title?.trim() || null,
        body: input.body?.trim() || null,
        status: 'pending',
      })
      .returning({ id: reviews.id, status: reviews.status })
    return created!
  } catch (error) {
    // `UNIQUE(order_item_id)`: una sola reseña por línea comprada (§5.10).
    if (String(error).includes('reviews_order_item_id_key')) {
      throw new AppError('CONFLICT', 'Ya has reseñado ese artículo', error)
    }
    throw error
  }
}
