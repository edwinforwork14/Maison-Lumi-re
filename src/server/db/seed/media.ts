/**
 * Semilla de imágenes de producto (`product_media`).
 *
 * El catálogo de `src/data/products.ts` trae URLs de imagen, pero la tabla
 * `product_media` estaba vacía: sin filas, un checkout que lea de la base no
 * puede mostrar la foto de la línea. Se siembra de forma **idempotente** con
 * ids deterministas derivados del slug y la posición.
 *
 * Cuando exista un CDN real, `storage_key` apuntará allí y esto seguirá siendo
 * la forma de enlazar la imagen con su producto.
 */

import { eq } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { getDb, type Database } from '../client.ts'
import { productMedia, products } from '../schema/catalog.ts'
import { products as productSeeds } from '../../../data/products.ts'

/** UUID determinista (v5-like) a partir de una clave estable. */
function deterministicId(...parts: string[]): string {
  const hex = createHash('md5').update(parts.join(':')).digest('hex')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-')
}

export interface MediaSeedResult {
  readonly media: number
}

export async function seedProductMedia(db: Database = getDb()): Promise<MediaSeedResult> {
  // Se resuelve el id real del producto por slug (la semilla del catálogo crea
  // los productos con ids deterministas, pero no conviene asumirlos aquí).
  const rows = await db.select({ id: products.id, slug: products.slug }).from(products)
  const idBySlug = new Map(rows.map((row) => [row.slug, row.id]))

  const values = productSeeds.flatMap((product) =>
    product.images.map((url, index) => ({
      id: deterministicId('media', product.slug, String(index)),
      productId: idBySlug.get(product.slug),
      storageKey: url,
      alt: `${product.name} — vista ${index + 1}`,
      width: 900,
      height: 1200,
      type: 'image',
      position: index,
    })),
  )

  // Sin producto en la base (semilla de catálogo no ejecutada) no hay nada que enlazar.
  const linked = values.filter((value): value is typeof value & { productId: string } =>
    Boolean(value.productId),
  )
  if (linked.length === 0) return { media: 0 }

  await db
    .insert(productMedia)
    .values(linked)
    .onConflictDoUpdate({
      target: productMedia.id,
      set: { storageKey: productMedia.storageKey, updatedAt: new Date() },
    })

  return { media: linked.length }
}

/** Cuenta las imágenes de un producto (útil para tests y diagnóstico). */
export async function countProductMedia(
  productSlug: string,
  db: Database = getDb(),
): Promise<number> {
  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.slug, productSlug))
    .limit(1)
  if (!product) return 0
  const rows = await db
    .select({ id: productMedia.id })
    .from(productMedia)
    .where(eq(productMedia.productId, product.id))
  return rows.length
}
