/**
 * Semillas idempotentes del catálogo, el inventario, el envío, los impuestos,
 * los ajustes de tienda y el usuario administrador (plan 01 §7, §10-F6).
 *
 * Reglas que cumple este módulo:
 * - **Ids deterministas**: `deterministicId(kind, key)` deriva un UUID de
 *   `md5(namespace + kind + key)`. El mismo catálogo produce los mismos ids en
 *   cualquier máquina y en cualquier ejecución, así que el seed es idempotente
 *   sin consultar antes la base (§7: «seeds idempotentes con ids deterministas»).
 * - **Upsert, nunca borrado**: cada tabla se escribe con
 *   `ON CONFLICT (id) DO UPDATE` (y `DO NOTHING` donde no procede actualizar).
 *   Ejecutar el seed dos veces deja el mismo número de filas y los mismos
 *   valores: no se recrea ninguna tabla ni se borra ninguna fila.
 * - **Dinero en céntimos**: todo importe es un entero `*_cents`. Precios, stock
 *   y SKU vienen de las semillas del servidor (`server/seed/catalog.ts`), que ya
 *   derivan una variante por color con SKU y stock propios.
 * - **Nada de credenciales reales**: el admin sembrado usa un dominio reservado
 *   (`.test`) y una contraseña de documentación; lo que se guarda es un hash
 *   `scrypt` real de `node:crypto`, nunca base64 ni la contraseña en claro.
 *
 * Mapeo de las semillas legacy (`src/data/**`, plan §9): `priceCents` →
 * `products`/`product_variants`, `colors` → una variante por color,
 * `stock` → `inventory_items.on_hand`, `shippingMethods` → `shipping_methods`.
 */

import { createHash, scryptSync, timingSafeEqual } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { shippingMethods as shippingMethodData } from '../../../data/shipping.ts'
import { categorySeeds, collectionSeeds, productSeeds } from '../../seed/catalog.ts'
import type { Database } from '../client.ts'
import {
  categories as categoriesTable,
  collections as collectionsTable,
  productVariants,
  products as productsTable,
} from '../schema/catalog.ts'
import { siteSettings } from '../schema/content.ts'
import { roles, userRoles, users } from '../schema/identity.ts'
import { inventoryItems } from '../schema/inventory.ts'
import { shippingMethods, taxRates } from '../schema/shipping.ts'

/** Transacción de Drizzle: los upserts comparten una única transacción. */
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

// ─── Constantes de la semilla ────────────────────────────────────────────────

/** Espacio de nombres de los ids: cambiarlo re-siembra ids nuevos. */
const ID_NAMESPACE = 'maison-lumiere:db-seed:v1'

/**
 * Marca temporal fija (no `now()`): `published_at`, `effective_from` y
 * `granted_at` deben ser idénticos entre ejecuciones para que el seed sea
 * reproducible. Es también la fecha desde la que rige el IVA general español.
 */
const SEED_EPOCH = new Date('2025-01-01T00:00:00.000Z')

/**
 * El catálogo actual no distingue tallas (defecto D14 lo cierra la BD, no los
 * datos): cada color es una variante y la talla declarada es única. Talla y
 * color forman la clave `UNIQUE(product_id, size, color)`.
 */
const SINGLE_SIZE = 'Única'

/** Aviso de reposición de las existencias sembradas. */
const LOW_STOCK_THRESHOLD = 3

/** IVA general español: 21 % en puntos básicos (§4: `rate_bp`). */
const TAX_RATE_BP_ES_STANDARD = 2_100

/** Umbral de envío gratuito en céntimos: 500,00 € (coincide con el dominio). */
const FREE_SHIPPING_THRESHOLD_CENTS = 50_000

/**
 * Contraseña de **desarrollo** del admin sembrado (sólo para `npm run db:seed`
 * en local/CI). No es una credencial real: el email vive en el TLD reservado
 * `.test` y jamás se ejecuta este seed contra producción.
 */
export const DEV_ADMIN_PASSWORD = 'maison-dev-admin'

/** Email del admin sembrado: dominio reservado, nunca una cuenta real. */
export const DEV_ADMIN_EMAIL = 'admin@maison-lumiere.test'

/** Parámetros de `scrypt`; van escritos dentro del propio hash. */
const SCRYPT = { n: 16_384, r: 8, p: 1, keyLength: 64, saltLength: 16 } as const

// ─── Ids deterministas ───────────────────────────────────────────────────────

/**
 * UUID v5-like determinista: `md5(namespace:kind:key)` con los bits de versión
 * (`5`) y de variante reescritos, para que PostgreSQL lo acepte como `uuid`.
 * Sin dependencia de la base: el mismo `kind`/`key` da siempre el mismo id.
 */
export function deterministicId(kind: string, key: string): string {
  const hex = createHash('md5')
    .update(`${ID_NAMESPACE}:${kind}:${key}`)
    .digest('hex')
  const variantNibble = ((Number.parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16)
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${variantNibble}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-')
}

// ─── Contraseñas (sólo semilla) ──────────────────────────────────────────────

/**
 * Sal **determinista** derivada del email: hace el seed reproducible (mismo
 * hash en cada ejecución, criterio de «mismo estado» del §7). La sal aleatoria
 * por usuario pertenece al hasher de producción
 * (`src/server/runtime/password-hasher.ts`, plan §9), no a una semilla de
 * desarrollo.
 */
export function devPasswordSalt(email: string): Buffer {
  return createHash('sha256')
    .update(`${ID_NAMESPACE}:password-salt:${email.trim().toLowerCase()}`)
    .digest()
    .subarray(0, SCRYPT.saltLength)
}

/** Hash con formato PHC-like: `$scrypt$N=…,r=…,p=…$<sal-b64url>$<clave-b64url>`. */
export function hashPassword(password: string, salt: Buffer): string {
  const key = scryptSync(password, salt, SCRYPT.keyLength, {
    N: SCRYPT.n,
    r: SCRYPT.r,
    p: SCRYPT.p,
  })
  return `$scrypt$N=${SCRYPT.n},r=${SCRYPT.r},p=${SCRYPT.p}$${salt.toString('base64url')}$${key.toString('base64url')}`
}

/** Verifica un hash del formato anterior con comparación en tiempo constante. */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 5 || parts[1] !== 'scrypt') return false

  const params = new Map(
    (parts[2] ?? '').split(',').map((pair) => {
      const [name, value] = pair.split('=')
      return [name ?? '', Number(value)] as const
    }),
  )
  const n = params.get('N')
  const r = params.get('r')
  const p = params.get('p')
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false

  const salt = Buffer.from(parts[3] ?? '', 'base64url')
  const expected = Buffer.from(parts[4] ?? '', 'base64url')
  if (salt.length === 0 || expected.length === 0) return false

  const actual = scryptSync(password, salt, expected.length, {
    N: n as number,
    r: r as number,
    p: p as number,
  })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

// ─── Taxonomía ───────────────────────────────────────────────────────────────

async function upsertCategories(tx: Tx): Promise<number> {
  if (categorySeeds.length === 0) return 0
  const rows = categorySeeds.map((category, index) => ({
    id: deterministicId('category', category.slug),
    parentId: null,
    slug: category.slug,
    name: category.name,
    description: category.description,
    position: index,
    status: 'active',
  }))

  await tx
    .insert(categoriesTable)
    .values(rows)
    .onConflictDoUpdate({
      target: categoriesTable.id,
      set: {
        slug: sql`excluded.slug`,
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        position: sql`excluded.position`,
        status: sql`excluded.status`,
        updatedAt: sql`now()`,
      },
    })
  return rows.length
}

async function upsertCollections(tx: Tx): Promise<number> {
  if (collectionSeeds.length === 0) return 0
  const rows = collectionSeeds.map((collection, index) => ({
    id: deterministicId('collection', collection.slug),
    slug: collection.slug,
    name: collection.name,
    description: collection.description,
    position: index,
    status: 'active',
  }))

  await tx
    .insert(collectionsTable)
    .values(rows)
    .onConflictDoUpdate({
      target: collectionsTable.id,
      set: {
        slug: sql`excluded.slug`,
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        position: sql`excluded.position`,
        status: sql`excluded.status`,
        updatedAt: sql`now()`,
      },
    })
  return rows.length
}

/** Categorías y colecciones por id y por slug (las semillas usan ambos). */
function taxonomyIndex(): {
  categoryId: (key: string) => string
  collectionId: (key: string) => string
} {
  const categoryIds = new Map<string, string>()
  for (const category of categorySeeds) {
    const id = deterministicId('category', category.slug)
    categoryIds.set(category.slug, id)
    categoryIds.set(category.id, id)
  }
  const collectionIds = new Map<string, string>()
  for (const collection of collectionSeeds) {
    const id = deterministicId('collection', collection.slug)
    collectionIds.set(collection.slug, id)
    collectionIds.set(collection.id, id)
  }

  return {
    categoryId(key: string): string {
      const id = categoryIds.get(key)
      if (!id) {
        throw new Error(
          `El producto apunta a la categoría "${key}", que no existe en src/data/categories.ts`,
        )
      }
      return id
    },
    collectionId(key: string): string {
      const id = collectionIds.get(key)
      if (!id) {
        throw new Error(
          `El producto apunta a la colección "${key}", que no existe en src/data/collections.ts`,
        )
      }
      return id
    },
  }
}

// ─── Catálogo ────────────────────────────────────────────────────────────────

async function upsertProducts(tx: Tx): Promise<number> {
  if (productSeeds.length === 0) return 0
  const index = taxonomyIndex()
  const rows = productSeeds.map((product) => ({
    id: deterministicId('product', product.slug),
    slug: product.slug,
    name: product.name,
    shortDescription: null,
    description: product.description,
    categoryId: index.categoryId(product.category),
    brandId: null,
    collectionId: index.collectionId(product.collection),
    status: 'active',
    featured: product.featured,
    // `status = 'active'` obliga a tener fecha de publicación.
    publishedAt: SEED_EPOCH,
    seoTitle: `${product.name} · Maison Lumière`,
    seoDescription: product.description,
  }))

  await tx
    .insert(productsTable)
    .values(rows)
    .onConflictDoUpdate({
      target: productsTable.id,
      set: {
        slug: sql`excluded.slug`,
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        categoryId: sql`excluded.category_id`,
        collectionId: sql`excluded.collection_id`,
        status: sql`excluded.status`,
        featured: sql`excluded.featured`,
        publishedAt: sql`excluded.published_at`,
        seoTitle: sql`excluded.seo_title`,
        seoDescription: sql`excluded.seo_description`,
        updatedAt: sql`now()`,
      },
    })
  return rows.length
}

async function upsertVariants(tx: Tx): Promise<number> {
  const rows = productSeeds.flatMap((product) =>
    product.variants.map((variant) => ({
      id: deterministicId('variant', variant.sku),
      productId: deterministicId('product', product.slug),
      sku: variant.sku,
      size: SINGLE_SIZE,
      color: variant.color,
      priceCents: variant.priceCents,
      compareAtPriceCents: product.compareAtPriceCents ?? null,
      currency: 'EUR',
      weightGrams: null,
      status: 'active',
    })),
  )
  if (rows.length === 0) return 0

  await tx
    .insert(productVariants)
    .values(rows)
    .onConflictDoUpdate({
      target: productVariants.id,
      set: {
        productId: sql`excluded.product_id`,
        sku: sql`excluded.sku`,
        size: sql`excluded.size`,
        color: sql`excluded.color`,
        priceCents: sql`excluded.price_cents`,
        compareAtPriceCents: sql`excluded.compare_at_price_cents`,
        currency: sql`excluded.currency`,
        status: sql`excluded.status`,
        updatedAt: sql`now()`,
      },
    })
  return rows.length
}

// ─── Inventario ──────────────────────────────────────────────────────────────

async function upsertInventory(tx: Tx): Promise<number> {
  const rows = productSeeds.flatMap((product) =>
    product.variants.map((variant) => ({
      variantId: deterministicId('variant', variant.sku),
      onHand: variant.stock,
      reserved: 0,
      lowStockThreshold: LOW_STOCK_THRESHOLD,
    })),
  )
  if (rows.length === 0) return 0

  await tx
    .insert(inventoryItems)
    .values(rows)
    .onConflictDoUpdate({
      target: inventoryItems.variantId,
      // `reserved` no se toca a propósito: una reserva viva (carrito o pedido
      // en curso) no es asunto de una semilla; el stock declarado sí.
      set: {
        onHand: sql`excluded.on_hand`,
        lowStockThreshold: sql`excluded.low_stock_threshold`,
        updatedAt: sql`now()`,
      },
    })
  return rows.length
}

// ─── Envío e impuestos ───────────────────────────────────────────────────────

/** Plazos y transportista por método; el precio viene de `src/data/shipping.ts`. */
const SHIPPING_META: Record<
  string,
  { carrier: string; etaMinDays: number; etaMaxDays: number }
> = {
  standard: { carrier: 'Correos Express', etaMinDays: 3, etaMaxDays: 5 },
  express: { carrier: 'DHL Express', etaMinDays: 1, etaMaxDays: 2 },
}

async function upsertShippingMethods(tx: Tx): Promise<number> {
  const rows = shippingMethodData.map((method) => {
    const meta = SHIPPING_META[method.id]
    if (!meta) {
      throw new Error(`Falta el plazo/transportista del método de envío "${method.id}"`)
    }
    return {
      id: deterministicId('shipping-method', method.id),
      code: method.id,
      name: method.name,
      carrier: meta.carrier,
      etaMinDays: meta.etaMinDays,
      etaMaxDays: meta.etaMaxDays,
      // `Money.amount` ya es un entero en céntimos.
      priceCents: method.price.amount,
      currency: 'EUR',
      status: 'active',
    }
  })
  if (rows.length === 0) return 0

  await tx
    .insert(shippingMethods)
    .values(rows)
    .onConflictDoUpdate({
      target: shippingMethods.id,
      set: {
        code: sql`excluded.code`,
        name: sql`excluded.name`,
        carrier: sql`excluded.carrier`,
        etaMinDays: sql`excluded.eta_min_days`,
        etaMaxDays: sql`excluded.eta_max_days`,
        priceCents: sql`excluded.price_cents`,
        currency: sql`excluded.currency`,
        status: sql`excluded.status`,
        updatedAt: sql`now()`,
      },
    })
  return rows.length
}

async function upsertTaxRates(tx: Tx): Promise<number> {
  const rows = [
    {
      id: deterministicId('tax-rate', 'ES:standard'),
      countryCode: 'ES',
      region: null,
      kind: 'standard',
      rateBp: TAX_RATE_BP_ES_STANDARD,
      effectiveFrom: SEED_EPOCH,
      effectiveTo: null,
    },
  ]

  await tx
    .insert(taxRates)
    .values(rows)
    .onConflictDoUpdate({
      target: taxRates.id,
      set: {
        countryCode: sql`excluded.country_code`,
        region: sql`excluded.region`,
        kind: sql`excluded.kind`,
        rateBp: sql`excluded.rate_bp`,
        effectiveFrom: sql`excluded.effective_from`,
        updatedAt: sql`now()`,
      },
    })
  return rows.length
}

// ─── Ajustes del sitio ───────────────────────────────────────────────────────

/** Ajustes base: moneda, locale y umbral de envío gratuito (§10-F6). */
export const SITE_SETTING_SEEDS = [
  { key: 'site.currency', value: 'EUR', type: 'string' },
  { key: 'site.locale', value: 'es-ES', type: 'string' },
  { key: 'shipping.free_threshold_cents', value: FREE_SHIPPING_THRESHOLD_CENTS, type: 'number' },
  // Contacto de WhatsApp: es el cierre de la compra, porque la tienda no cobra
  // en línea. Se cambia desde el panel (Ajustes) sin tocar código.
  { key: 'contact.whatsapp', value: '34600111222', type: 'string' },
  { key: 'contact.whatsapp_name', value: 'Atención Maison Lumière', type: 'string' },
] as const

async function upsertSiteSettings(tx: Tx, adminId: string): Promise<number> {
  const rows = SITE_SETTING_SEEDS.map((setting) => ({
    key: setting.key,
    value: setting.value,
    type: setting.type,
    updatedBy: adminId,
  }))

  await tx
    .insert(siteSettings)
    .values(rows)
    .onConflictDoUpdate({
      target: siteSettings.key,
      set: {
        value: sql`excluded.value`,
        type: sql`excluded.type`,
        updatedBy: sql`excluded.updated_by`,
        updatedAt: sql`now()`,
      },
    })
  return rows.length
}

// ─── Cuentas ─────────────────────────────────────────────────────────────────

/** Rol de administración y admin de desarrollo con hash scrypt real. */
async function upsertAdmin(
  tx: Tx,
  password: string,
): Promise<{ users: number; roles: number }> {
  let roleId = deterministicId('role', 'admin')
  const userId = deterministicId('user', DEV_ADMIN_EMAIL)

  await tx
    .insert(roles)
    .values({
      id: roleId,
      key: 'admin',
      name: 'Administrador',
      description: 'Acceso completo al panel de administración',
    })
    .onConflictDoUpdate({
      target: roles.key,
      set: {
        key: sql`excluded.key`,
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        updatedAt: sql`now()`,
      },
    })

  // El id del rol se RESUELVE por su clave natural: otra semilla (RBAC) puede
  // haberlo creado con otro id, y usar el determinista rompería la FK de
  // `user_roles` al ejecutar ambas semillas seguidas.
  const [existingRole] = await tx
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.key, 'admin'))
    .limit(1)
  if (existingRole) roleId = existingRole.id

  await tx
    .insert(users)
    .values({
      id: userId,
      email: DEV_ADMIN_EMAIL,
      passwordHash: hashPassword(password, devPasswordSalt(DEV_ADMIN_EMAIL)),
      status: 'active',
      emailVerifiedAt: SEED_EPOCH,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email: sql`excluded.email`,
        passwordHash: sql`excluded.password_hash`,
        status: sql`excluded.status`,
        updatedAt: sql`now()`,
      },
    })

  await tx
    .insert(userRoles)
    .values({ userId, roleId, grantedBy: userId, grantedAt: SEED_EPOCH })
    .onConflictDoNothing()

  return { users: 1, roles: 1 }
}

// ─── Punto de entrada ────────────────────────────────────────────────────────

export interface SeedOptions {
  /** Contraseña del admin sembrado; por defecto la de desarrollo documentada. */
  readonly adminPassword?: string
}

/** Filas escritas por el seed, para el log de `npm run db:seed`. */
export interface SeedSummary {
  readonly categories: number
  readonly collections: number
  readonly products: number
  readonly variants: number
  readonly inventoryItems: number
  readonly shippingMethods: number
  readonly taxRates: number
  readonly siteSettings: number
  readonly users: number
  readonly roles: number
}

/**
 * Siembra el catálogo completo y la configuración base en **una transacción**.
 * Idempotente: ejecutarlo dos veces deja el mismo estado (mismos ids, mismas
 * filas, mismos valores), sin borrar ni recrear nada.
 */
export async function seedCatalog(
  db: Database,
  options: SeedOptions = {},
): Promise<SeedSummary> {
  const adminPassword = options.adminPassword ?? DEV_ADMIN_PASSWORD

  return db.transaction(async (tx) => {
    const categories = await upsertCategories(tx)
    const collections = await upsertCollections(tx)
    const products = await upsertProducts(tx)
    const variants = await upsertVariants(tx)
    const inventoryItemsWritten = await upsertInventory(tx)
    const admin = await upsertAdmin(tx, adminPassword)
    const shippingMethodsWritten = await upsertShippingMethods(tx)
    const taxRatesWritten = await upsertTaxRates(tx)
    const siteSettingsWritten = await upsertSiteSettings(
      tx,
      deterministicId('user', DEV_ADMIN_EMAIL),
    )

    return {
      categories,
      collections,
      products,
      variants,
      inventoryItems: inventoryItemsWritten,
      shippingMethods: shippingMethodsWritten,
      taxRates: taxRatesWritten,
      siteSettings: siteSettingsWritten,
      users: admin.users,
      roles: admin.roles,
    }
  })
}
