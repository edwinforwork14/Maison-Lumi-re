import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import postgres from 'postgres'
import { shippingMethods as shippingMethodData } from '../../src/data/shipping.ts'
import { closeDb, createDbClient } from '../../src/server/db/client.ts'
import {
  DEV_ADMIN_EMAIL,
  DEV_ADMIN_PASSWORD,
  SITE_SETTING_SEEDS,
  deterministicId,
  seedDatabase,
  verifyPassword,
  type SeedSummary,
} from '../../src/server/db/seed/index.ts'
import { categorySeeds, collectionSeeds, productSeeds } from '../../src/server/seed/catalog.ts'

/**
 * Seeds idempotentes contra PostgreSQL real (plan 01 §7 y §10-F6).
 *
 * Lo que comprueba:
 * - ejecutar el seed DOS veces seguidas deja el mismo número de filas
 *   (idempotencia con ids deterministas y `ON CONFLICT (id) DO UPDATE`);
 * - los 28 productos están, cada uno con al menos una variante de SKU único;
 * - la suma de `inventory_items.on_hand` es la suma del stock del catálogo;
 * - el admin guarda un hash `scrypt` real (con sal y parámetros en el propio
 *   hash) y nunca la contraseña en claro.
 *
 * Requiere `DATABASE_URL`; sin ella la suite se omite. `postgres.js` devuelve
 * `bigint`/`numeric` como string, así que todo conteo pasa por `Number()`.
 *
 *   docker run -d --name ml-postgres -e POSTGRES_PASSWORD=... -p 5433:5432 postgres:16-alpine
 *   DATABASE_URL=postgres://ml:...@localhost:5433/maison_lumiere npm run test:db
 */

const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL
if (!url) {
  console.warn(
    '[tests/db] DATABASE_URL no definida: la suite de seeds se omite. Ejecútala con `npm run test:db`.',
  )
}

const suite = url ? describe : describe.skip

/** Conteos de las filas SEMBRADAS (ver la nota de alcance en `countSeededRows`). */
interface RowCounts {
  readonly products: number
  readonly productVariants: number
  readonly inventoryItems: number
  readonly categories: number
  readonly collections: number
  readonly shippingMethods: number
  readonly taxRates: number
  readonly siteSettings: number
  /** Totales de tablas que ningún otro test toca: detectan duplicados globales. */
  readonly shippingMethodsTotal: number
  readonly siteSettingsTotal: number
}

interface SeedRuns {
  readonly firstSummary: SeedSummary
  readonly secondSummary: SeedSummary
  readonly first: RowCounts
  readonly second: RowCounts
}

if (url) {
  const databaseUrl: string = url
  const sql = postgres(databaseUrl, { max: 3, onnotice: () => {} })
  const db = createDbClient(databaseUrl)

  after(async () => {
    await closeDb()
    await sql.end({ timeout: 5 })
  })

  const productSlugs = productSeeds.map((product) => product.slug)
  const seededSkus = productSeeds.flatMap((product) =>
    product.variants.map((variant) => variant.sku),
  )
  const seededVariantIds = seededSkus.map((sku) => deterministicId('variant', sku))
  const seededProductIds = productSlugs.map((slug) => deterministicId('product', slug))
  const categorySlugs = categorySeeds.map((category) => category.slug)
  const collectionSlugs = collectionSeeds.map((collection) => collection.slug)
  const shippingCodes = shippingMethodData.map((method) => method.id)
  const settingKeys = SITE_SETTING_SEEDS.map((setting) => setting.key)
  const catalogStockTotal = productSeeds.reduce((total, product) => total + product.stock, 0)

  /**
   * Conteos acotados a las claves sembradas (slug, SKU, id determinista, code y
   * key). No se cuentan filas ajenas a propósito: `tests/db/*.test.ts` corre en
   * paralelo y `integrity.test.ts` inserta categorías, productos, variantes y
   * existencias con tokens aleatorios, así que un `count(*)` global sería una
   * carrera. La comparación entre las dos ejecuciones sigue siendo exacta: si el
   * seed duplicara una fila, este conteo subiría.
   */
  async function countSeededRows(): Promise<RowCounts> {
    const [row] = await sql<
      {
        products: string
        product_variants: string
        inventory_items: string
        categories: string
        collections: string
        shipping_methods: string
        tax_rates: string
        site_settings: string
        shipping_methods_total: string
        site_settings_total: string
      }[]
    >`
      SELECT
        (SELECT count(*) FROM products WHERE slug IN ${sql(productSlugs)}) AS products,
        (SELECT count(*) FROM product_variants WHERE sku IN ${sql(seededSkus)}) AS product_variants,
        (SELECT count(*) FROM inventory_items
          WHERE variant_id IN ${sql(seededVariantIds)}) AS inventory_items,
        (SELECT count(*) FROM categories WHERE slug IN ${sql(categorySlugs)}) AS categories,
        (SELECT count(*) FROM collections WHERE slug IN ${sql(collectionSlugs)}) AS collections,
        (SELECT count(*) FROM shipping_methods
          WHERE code IN ${sql(shippingCodes)}) AS shipping_methods,
        (SELECT count(*) FROM tax_rates
          WHERE country_code = 'ES' AND kind = 'standard') AS tax_rates,
        (SELECT count(*) FROM site_settings WHERE key IN ${sql(settingKeys)}) AS site_settings,
        (SELECT count(*) FROM shipping_methods) AS shipping_methods_total,
        (SELECT count(*) FROM site_settings) AS site_settings_total
    `

    assert.ok(row, 'la consulta de conteos no devolvió fila')
    return {
      products: Number(row.products),
      productVariants: Number(row.product_variants),
      inventoryItems: Number(row.inventory_items),
      categories: Number(row.categories),
      collections: Number(row.collections),
      shippingMethods: Number(row.shipping_methods),
      taxRates: Number(row.tax_rates),
      siteSettings: Number(row.site_settings),
      shippingMethodsTotal: Number(row.shipping_methods_total),
      siteSettingsTotal: Number(row.site_settings_total),
    }
  }

  let runs!: SeedRuns

  suite('BD: los seeds son idempotentes (plan 01 §7)', () => {
    before(async () => {
      // (a) Dos ejecuciones SEGUIDAS del seed, contando filas después de cada una.
      const firstSummary = await seedDatabase(db)
      const first = await countSeededRows()
      const secondSummary = await seedDatabase(db)
      const second = await countSeededRows()
      runs = { firstSummary, secondSummary, first, second }
    })

    it('la segunda ejecución deja exactamente el mismo número de filas', () => {
      assert.deepEqual(
        runs.second,
        runs.first,
        `conteos tras la 1ª ejecución: ${JSON.stringify(runs.first)} / tras la 2ª: ${JSON.stringify(runs.second)}`,
      )
      // El seed declara cuántas filas escribió: las dos ejecuciones escriben las mismas.
      assert.deepEqual(runs.secondSummary, runs.firstSummary)
      assert.ok(runs.first.products > 0, 'el seed no sembró ningún producto')
    })

    it('siembra los 28 productos, cada uno con variantes de SKU único', async () => {
      assert.equal(productSeeds.length, 28, 'el catálogo de partida debe tener 28 productos')
      assert.equal(runs.first.products, 28, 'deben existir 28 productos sembrados')
      assert.equal(runs.first.productVariants, seededSkus.length)

      const [counted] = await sql<{ productos: string; productos_con_variante: string }[]>`
        SELECT
          (SELECT count(*) FROM products WHERE id IN ${sql(seededProductIds)}) AS productos,
          (SELECT count(*) FROM (
            SELECT product_id FROM product_variants
            WHERE sku IN ${sql(seededSkus)}
            GROUP BY product_id
          ) AS con_variante
          WHERE product_id IN ${sql(seededProductIds)}) AS productos_con_variante
      `
      assert.equal(Number(counted!.productos), 28)
      assert.equal(
        Number(counted!.productos_con_variante),
        28,
        'cada producto debe tener al menos una variante',
      )

      // SKU único: ni en las semillas ni en la base.
      assert.equal(new Set(seededSkus).size, seededSkus.length, 'hay SKU repetidos en las semillas')
      const [skus] = await sql<{ total: string; distintos: string }[]>`
        SELECT count(*) AS total, count(DISTINCT sku) AS distintos
        FROM product_variants WHERE sku IN ${sql(seededSkus)}
      `
      assert.equal(Number(skus!.total), seededSkus.length)
      assert.equal(Number(skus!.distintos), seededSkus.length)
    })

    it('la suma de on_hand es la suma del stock del catálogo', async () => {
      const [row] = await sql<{ suma: string; filas: string }[]>`
        SELECT coalesce(sum(on_hand), 0) AS suma, count(*) AS filas
        FROM inventory_items WHERE variant_id IN ${sql(seededVariantIds)}
      `
      // `sum(bigint)` llega como string: se normaliza con Number().
      assert.equal(
        Number(row!.suma),
        catalogStockTotal,
        `la suma de on_hand debe ser ${catalogStockTotal} céntimos/unidades`,
      )
      assert.equal(Number(row!.filas), seededVariantIds.length, 'una fila de inventario por variante')
      assert.ok(catalogStockTotal > 0)
      assert.equal(runs.first.inventoryItems, seededVariantIds.length)
    })

    it('el admin guarda un hash scrypt real y nunca la contraseña en claro', async () => {
      const [admin] = await sql<{ id: string; email: string; password_hash: string }[]>`
        SELECT id, email, password_hash FROM users
        WHERE id = ${deterministicId('user', DEV_ADMIN_EMAIL)}
      `
      assert.ok(admin, 'el admin sembrado debe existir')
      const hash = admin.password_hash

      // Formato: $scrypt$N=…,r=…,p=…$<sal>$<clave> (prefijo + sal propios).
      assert.match(hash, /^\$scrypt\$/)
      const parts = hash.split('$')
      assert.equal(parts.length, 5, `hash inesperado: ${hash}`)
      assert.equal(parts[1], 'scrypt')
      assert.match(parts[2] ?? '', /N=\d+,r=\d+,p=\d+/)
      assert.ok((parts[3] ?? '').length > 0, 'el hash debe incluir sal')
      assert.ok((parts[4] ?? '').length > 0, 'el hash debe incluir la clave derivada')

      // Nunca la contraseña, ni su base64 (lo que hacía el store en memoria).
      assert.ok(!hash.includes(DEV_ADMIN_PASSWORD))
      assert.notEqual(hash, Buffer.from(DEV_ADMIN_PASSWORD).toString('base64'))
      assert.notEqual(hash, Buffer.from(DEV_ADMIN_PASSWORD).toString('base64url'))

      // El hash es real y verificable (y falla con otra contraseña).
      assert.equal(verifyPassword(DEV_ADMIN_PASSWORD, hash), true)
      assert.equal(verifyPassword(`${DEV_ADMIN_PASSWORD}-x`, hash), false)

      // Sin credenciales reales: dominio reservado para pruebas.
      assert.match(admin.email, /@maison-lumiere\.test$/)
    })

    it('los ajustes base sirven moneda, locale y umbral de envío gratuito', async () => {
      const rows = await sql<{ key: string; value: unknown; type: string }[]>`
        SELECT key, value, type FROM site_settings WHERE key IN ${sql(settingKeys)}
      `
      const byKey = new Map(rows.map((row) => [row.key, row]))
      assert.equal(byKey.get('site.currency')?.value, 'EUR')
      assert.equal(byKey.get('site.locale')?.value, 'es-ES')
      // El umbral se guarda en céntimos, como todo importe del proyecto.
      assert.equal(byKey.get('shipping.free_threshold_cents')?.value, 50_000)
      assert.equal(byKey.get('site.currency')?.type, 'string')
      assert.equal(byKey.get('shipping.free_threshold_cents')?.type, 'number')
      assert.equal(runs.first.siteSettings, settingKeys.length)
    })
  })
}
