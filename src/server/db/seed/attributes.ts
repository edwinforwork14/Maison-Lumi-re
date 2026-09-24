/**
 * Semilla de atributos del producto que no venían del catálogo original.
 *
 * De momento, los **materiales** (`products.materials`): la tienda filtra por
 * ellos y la base no los tenía. Se siembran de forma idempotente desde
 * `src/data/products.ts`, que es la fuente que ya los define.
 */

import { eq, sql } from 'drizzle-orm'
import { getDb, type Database } from '../client.ts'
import { products } from '../schema/catalog.ts'
import { products as productSeeds } from '../../../data/products.ts'

export interface AttributesSeedResult {
  readonly updated: number
}

export async function seedProductAttributes(db: Database = getDb()): Promise<AttributesSeedResult> {
  let updated = 0
  for (const seed of productSeeds) {
    const result = await db
      .update(products)
      .set({ materials: seed.materials, updatedAt: new Date() })
      .where(eq(products.slug, seed.slug))
      .returning({ id: products.id })
    if (result.length > 0) updated += 1
  }
  return { updated }
}

/** Materiales distintos presentes en el catálogo activo (para facetas). */
export async function listMaterialsFromDb(db: Database = getDb()): Promise<string[]> {
  const rows = await db
    .select({ material: sql<string>`unnest(${products.materials})` })
    .from(products)
    .where(eq(products.status, 'active'))
  return [...new Set(rows.map((row) => row.material))].filter(Boolean).sort()
}
