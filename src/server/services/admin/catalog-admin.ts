/**
 * Servicios de administración del catálogo y del inventario (Plan 02, G2 y G3).
 *
 * Cada operación: (1) exige permiso, (2) hace el trabajo en una transacción,
 * (3) deja traza en `audit_logs` con `before`/`after` **selectivo**. Los
 * servicios son funciones puras respecto a HTTP: reciben el actor y la base de
 * datos, así que se prueban sin levantar un servidor.
 */

import { and, asc, count, desc, eq, gt, gte, inArray, lt, lte, or, sql } from 'drizzle-orm'
import { money, type Money } from '../../../domain/money/money.ts'
import { getDb, type Database } from '../../db/client.ts'
import { clampPageSize, decodeCursor, paginate, type Page } from '../../db/pagination.ts'
import { inventoryItems, inventoryMovements } from '../../db/schema/inventory.ts'
import { orderItems, orders } from '../../db/schema/orders.ts'
import { categories, products, productVariants } from '../../db/schema/catalog.ts'
import { createPostgresAuditRepository } from '../../db/repositories/audit.postgres.ts'
import { createPostgresInventoryRepository } from '../../db/repositories/inventory.postgres.ts'
import { AppError } from '../../errors.ts'
import { assertPermission, type AdminActor } from './actor.ts'
import { PERMISSIONS } from './permissions.ts'

// ─── Productos ──────────────────────────────────────────────────────────────

export interface AdminProductListItem {
  readonly id: string
  readonly slug: string
  readonly name: string
  readonly status: string
  readonly featured: boolean
  readonly publishedAt: Date | null
  readonly updatedAt: Date
  readonly variantCount: number
  readonly minPriceCents: number | null
  readonly totalStock: number
}

export interface ListProductsFilters {
  readonly q?: string
  readonly status?: 'draft' | 'active' | 'archived'
  readonly featured?: boolean
  readonly cursor?: string | null
  readonly size?: number
}

export async function listAdminProducts(
  actor: AdminActor | null,
  filters: ListProductsFilters = {},
  db: Database = getDb(),
): Promise<Page<AdminProductListItem>> {
  assertPermission(actor, PERMISSIONS.productsRead)
  const limit = clampPageSize(filters.size)
  const cursor = filters.cursor ?? null

  const conditions = [sql`${products.deletedAt} is null`]
  if (filters.q?.trim()) {
    const like = `%${filters.q.trim().toLowerCase()}%`
    conditions.push(
      or(
        sql`lower(${products.name}) like ${like}`,
        sql`lower(${products.slug}) like ${like}`,
      )!,
    )
  }
  if (filters.status) conditions.push(eq(products.status, filters.status))
  if (filters.featured !== undefined) conditions.push(eq(products.featured, filters.featured))

  // El cursor llega opaco (base64url): se decodifica y se compara la tupla
  // (updated_at, id), que es exactamente el orden de la consulta.
  const decoded = decodeCursor(filters.cursor)
  if (decoded) {
    const cursorDate = new Date(decoded.k)
    if (!Number.isNaN(cursorDate.getTime())) {
      conditions.push(
        or(
          lt(products.updatedAt, cursorDate),
          and(eq(products.updatedAt, cursorDate), gt(products.id, decoded.id))!,
        )!,
      )
    }
  }

  // Se piden `limit + 1` filas: la extra dice si hay página siguiente sin un count.
  // Los agregados salen de LEFT JOIN (1:1 entre variante y existencias), no de
  // subconsultas correlacionadas: es más barato y no depende del motor.
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      status: products.status,
      featured: products.featured,
      publishedAt: products.publishedAt,
      updatedAt: products.updatedAt,
      variantCount: count(productVariants.id),
      minPriceCents: sql<
        number | null
      >`min(${productVariants.priceCents})::int`,
      totalStock: sql<number>`coalesce(sum(${inventoryItems.onHand}), 0)::int`,
    })
    .from(products)
    .leftJoin(productVariants, eq(productVariants.productId, products.id))
    .leftJoin(inventoryItems, eq(inventoryItems.variantId, productVariants.id))
    .where(and(...conditions))
    .groupBy(products.id)
    .orderBy(desc(products.updatedAt), asc(products.id))
    .limit(limit + 1)

  return paginate(
    rows.map((row) => ({
      ...row,
      variantCount: Number(row.variantCount),
      minPriceCents: row.minPriceCents === null ? null : Number(row.minPriceCents),
      totalStock: Number(row.totalStock),
    })),
    limit,
    (row) => row.updatedAt.toISOString(),
    (row) => row.id,
  )
}

export interface AdminProductPatch {
  readonly name?: string
  readonly shortDescription?: string | null
  readonly description?: string | null
  readonly categoryId?: string
  readonly featured?: boolean
  readonly seoTitle?: string | null
  readonly seoDescription?: string | null
}

/** Crea un producto en borrador y lo deja auditado. */
export async function createAdminProduct(
  actor: AdminActor | null,
  input: { slug: string; name: string; categoryId: string } & AdminProductPatch,
  db: Database = getDb(),
): Promise<{ id: string }> {
  assertPermission(actor, PERMISSIONS.productsWrite)
  const audit = createPostgresAuditRepository(db)

  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, input.slug.trim()))
      .limit(1)
    if (existing.length > 0) {
      throw new AppError('CONFLICT', `Ya existe un producto con el slug ${input.slug}`)
    }

    const [row] = await tx
      .insert(products)
      .values({
        slug: input.slug.trim(),
        name: input.name.trim(),
        categoryId: input.categoryId,
        shortDescription: input.shortDescription ?? null,
        description: input.description ?? null,
        featured: input.featured ?? false,
        seoTitle: input.seoTitle ?? null,
        seoDescription: input.seoDescription ?? null,
        status: 'draft',
      })
      .returning({ id: products.id })

    await audit.record({
      actorId: actor!.userId,
      actorKind: 'user',
      action: 'product.create',
      entity: 'products',
      entityId: row!.id,
      before: null,
      after: { slug: input.slug, name: input.name, status: 'draft' },
    })
    return { id: row!.id }
  })
}

/** Actualiza un producto, guardando sólo los campos que cambian. */
export async function updateAdminProduct(
  actor: AdminActor | null,
  input: { id: string } & AdminProductPatch,
  db: Database = getDb(),
): Promise<{ changed: string[] }> {
  assertPermission(actor, PERMISSIONS.productsWrite)
  const audit = createPostgresAuditRepository(db)

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(products)
      .where(eq(products.id, input.id))
      .for('update')
    if (!current) throw new AppError('NOT_FOUND', 'Producto inexistente')

    const patch: Record<string, unknown> = {}
    const before: Record<string, unknown> = {}
    const after: Record<string, unknown> = {}
    const keys: (keyof AdminProductPatch)[] = [
      'name',
      'shortDescription',
      'description',
      'categoryId',
      'featured',
      'seoTitle',
      'seoDescription',
    ]
    for (const key of keys) {
      const next = input[key]
      if (next === undefined) continue
      const previous = (current as Record<string, unknown>)[key]
      if (previous === next) continue
      patch[key] = next
      before[key] = previous
      after[key] = next
    }

    const changed = Object.keys(patch)
    if (changed.length === 0) return { changed: [] }

    await tx
      .update(products)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(products.id, input.id))

    await audit.record({
      actorId: actor!.userId,
      actorKind: 'user',
      action: 'product.update',
      entity: 'products',
      entityId: input.id,
      before,
      after,
    })
    return { changed }
  })
}

/**
 * Publica o archiva. Publicar exige variantes con precio: un producto sin nada
 * que vender no debe aparecer en la tienda (§4: `published_at` obligatorio).
 */
export async function setAdminProductStatus(
  actor: AdminActor | null,
  input: { id: string; status: 'draft' | 'active' | 'archived' },
  db: Database = getDb(),
): Promise<{ status: string; publishedAt: Date | null }> {
  assertPermission(actor, PERMISSIONS.productsPublish)
  const audit = createPostgresAuditRepository(db)

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(products)
      .where(eq(products.id, input.id))
      .for('update')
    if (!current) throw new AppError('NOT_FOUND', 'Producto inexistente')

    if (input.status === 'active') {
      const [variants] = await tx
        .select({ n: count() })
        .from(productVariants)
        .where(eq(productVariants.productId, input.id))
      if (Number(variants?.n ?? 0) === 0) {
        throw new AppError(
          'CONFLICT',
          'No se puede publicar un producto sin variantes: no habría nada que vender',
        )
      }
    }

    const publishedAt =
      input.status === 'active' ? (current.publishedAt ?? new Date()) : current.publishedAt

    await tx
      .update(products)
      .set({ status: input.status, publishedAt, updatedAt: new Date() })
      .where(eq(products.id, input.id))

    await audit.record({
      actorId: actor!.userId,
      actorKind: 'user',
      action: `product.${input.status === 'active' ? 'publish' : input.status}`,
      entity: 'products',
      entityId: input.id,
      before: { status: current.status },
      after: { status: input.status },
    })
    return { status: input.status, publishedAt }
  })
}

// ─── Inventario ─────────────────────────────────────────────────────────────

export interface AdminInventoryRow {
  readonly variantId: string
  readonly sku: string
  readonly productName: string
  readonly productSlug: string
  readonly size: string
  readonly color: string
  readonly onHand: number
  readonly reserved: number
  readonly available: number
  readonly lowStockThreshold: number
  readonly state: 'out' | 'low' | 'ok'
}

export async function listAdminInventory(
  actor: AdminActor | null,
  filters: { filter?: 'all' | 'low' | 'out'; cursor?: string | null; size?: number } = {},
  db: Database = getDb(),
): Promise<Page<AdminInventoryRow>> {
  assertPermission(actor, PERMISSIONS.inventoryRead)
  const limit = clampPageSize(filters.size)

  const conditions = []
  if (filters.filter === 'out') conditions.push(eq(inventoryItems.onHand, 0))
  if (filters.filter === 'low') {
    conditions.push(sql`${inventoryItems.onHand} <= ${inventoryItems.lowStockThreshold}`)
  }
  if (filters.cursor) {
    const cursorDate = new Date(filters.cursor)
    if (!Number.isNaN(cursorDate.getTime())) {
      conditions.push(lt(inventoryItems.updatedAt, cursorDate))
    }
  }

  const rows = await db
    .select({
      variantId: inventoryItems.variantId,
      sku: productVariants.sku,
      productName: products.name,
      productSlug: products.slug,
      size: productVariants.size,
      color: productVariants.color,
      onHand: inventoryItems.onHand,
      reserved: inventoryItems.reserved,
      lowStockThreshold: inventoryItems.lowStockThreshold,
      updatedAt: inventoryItems.updatedAt,
    })
    .from(inventoryItems)
    .innerJoin(productVariants, eq(productVariants.id, inventoryItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(inventoryItems.updatedAt), asc(inventoryItems.variantId))
    .limit(limit + 1)

  const mapped: Array<AdminInventoryRow & { updatedAt: Date }> = rows.map((row) => {
    const available = row.onHand - row.reserved
    const state = row.onHand === 0 ? 'out' : row.onHand <= row.lowStockThreshold ? 'low' : 'ok'
    return { ...row, available, state }
  })

  return paginate(
    mapped,
    limit,
    (row) => row.updatedAt.toISOString(),
    (row) => row.variantId,
  )
}

/**
 * Ajuste manual de stock: motivo obligatorio, movimiento en el ledger y fila de
 * auditoría. El stock negativo lo impide el adaptador (y la base, por si acaso).
 */
export async function adjustAdminInventory(
  actor: AdminActor | null,
  input: {
    variantId: string
    delta: number
    reason: 'purchase' | 'return' | 'adjustment' | 'correction'
    note?: string
  },
  db: Database = getDb(),
): Promise<AdminInventoryRow> {
  assertPermission(actor, PERMISSIONS.inventoryAdjust)
  if (!Number.isInteger(input.delta) || input.delta === 0) {
    throw new AppError('VALIDATION', 'El ajuste debe ser un número entero distinto de cero')
  }
  const inventory = createPostgresInventoryRepository(db)
  const audit = createPostgresAuditRepository(db)

  const snapshot = await inventory.adjust({
    variantId: input.variantId,
    delta: input.delta,
    reason: input.reason,
    note: input.note,
    actorId: actor!.userId,
  })

  const [row] = await db
    .select({
      sku: productVariants.sku,
      productName: products.name,
      productSlug: products.slug,
      size: productVariants.size,
      color: productVariants.color,
      lowStockThreshold: inventoryItems.lowStockThreshold,
    })
    .from(inventoryItems)
    .innerJoin(productVariants, eq(productVariants.id, inventoryItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(inventoryItems.variantId, input.variantId))
    .limit(1)

  await audit.record({
    actorId: actor!.userId,
    actorKind: 'user',
    action: 'inventory.adjust',
    entity: 'inventory_items',
    entityId: input.variantId,
    before: { onHand: snapshot.onHand - input.delta },
    after: { onHand: snapshot.onHand },
    requestId: input.note ?? null,
  })

  const state: AdminInventoryRow['state'] =
    snapshot.onHand === 0
      ? 'out'
      : snapshot.onHand <= (row?.lowStockThreshold ?? 0)
        ? 'low'
        : 'ok'

  return {
    variantId: snapshot.variantId,
    sku: row?.sku ?? '',
    productName: row?.productName ?? '',
    productSlug: row?.productSlug ?? '',
    size: row?.size ?? '',
    color: row?.color ?? '',
    onHand: snapshot.onHand,
    reserved: snapshot.reserved,
    available: snapshot.available,
    lowStockThreshold: row?.lowStockThreshold ?? 0,
    state,
  }
}

// ─── KPIs del panel (§7: SQL real, nunca números duros) ─────────────────────

export interface DashboardKpis {
  readonly from: string
  readonly to: string
  readonly sales: Money
  readonly orderCount: number
  readonly averageOrderValue: Money
  readonly topProducts: ReadonlyArray<{
    variantId: string
    sku: string
    name: string
    unitsSold: number
  }>
  readonly stockAlerts: { readonly low: number; readonly out: number }
  readonly recentOrders: ReadonlyArray<{
    number: string
    status: string
    totalCents: number
    placedAt: Date | null
  }>
}

const COUNTED_STATUSES = ['placed', 'paid', 'fulfilled'] as const

export async function dashboardKpis(
  actor: AdminActor | null,
  range: { from: Date; to: Date },
  db: Database = getDb(),
): Promise<DashboardKpis> {
  assertPermission(actor, PERMISSIONS.reportsRead)
  if (range.to <= range.from) {
    throw new AppError('VALIDATION', 'El rango de fechas no es válido')
  }

  const window = and(
    gte(orders.placedAt, range.from),
    lte(orders.placedAt, range.to),
    inArray(orders.status, [...COUNTED_STATUSES]),
  )

  const [totals] = await db
    .select({
      salesCents: sql<number>`coalesce(sum(${orders.totalCents}), 0)::bigint`,
      orderCount: count(),
    })
    .from(orders)
    .where(window)

  const salesCents = Number(totals?.salesCents ?? 0)
  const orderCount = Number(totals?.orderCount ?? 0)

  const top = await db
    .select({
      variantId: orderItems.variantId,
      sku: orderItems.skuSnapshot,
      name: orderItems.nameSnapshot,
      unitsSold: sql<number>`sum(${orderItems.quantity})::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(window)
    .groupBy(orderItems.variantId, orderItems.skuSnapshot, orderItems.nameSnapshot)
    .orderBy(desc(sql`sum(${orderItems.quantity})`))
    .limit(5)

  const [alerts] = await db
    .select({
      low: sql<number>`count(*) filter (where ${inventoryItems.onHand} > 0 and ${inventoryItems.onHand} <= ${inventoryItems.lowStockThreshold})::int`,
      out: sql<number>`count(*) filter (where ${inventoryItems.onHand} = 0)::int`,
    })
    .from(inventoryItems)

  const recent = await db
    .select({
      number: orders.number,
      status: orders.status,
      totalCents: orders.totalCents,
      placedAt: orders.placedAt,
    })
    .from(orders)
    .orderBy(desc(orders.placedAt))
    .limit(5)

  return {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    sales: money(salesCents),
    orderCount,
    averageOrderValue: money(orderCount > 0 ? Math.round(salesCents / orderCount) : 0),
    topProducts: top.map((row) => ({ ...row, unitsSold: Number(row.unitsSold) })),
    stockAlerts: { low: Number(alerts?.low ?? 0), out: Number(alerts?.out ?? 0) },
    recentOrders: recent,
  }
}

// ─── Auditoría (§6: sólo lectura) ───────────────────────────────────────────

export interface AuditListItem {
  readonly id: string
  readonly action: string
  readonly entity: string
  readonly entityId: string | null
  readonly actorId: string | null
  readonly actorKind: string
  readonly createdAt: Date
}

export async function listAuditEntries(
  actor: AdminActor | null,
  filters: { entity?: string; entityId?: string; limit?: number } = {},
  db: Database = getDb(),
): Promise<AuditListItem[]> {
  assertPermission(actor, PERMISSIONS.auditRead)
  const { auditLogs } = await import('../../db/schema/ops.ts')

  const conditions = []
  if (filters.entity) conditions.push(eq(auditLogs.entity, filters.entity))
  if (filters.entityId) conditions.push(eq(auditLogs.entityId, filters.entityId))

  return db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entity: auditLogs.entity,
      entityId: auditLogs.entityId,
      actorId: auditLogs.actorId,
      actorKind: auditLogs.actorKind,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(Math.min(filters.limit ?? 50, 200))
}

/** Utilidad interna para tests: filas creadas después de una fecha. */
export async function countAuditSince(
  since: Date,
  entity: string,
  db: Database = getDb(),
): Promise<number> {
  const { auditLogs } = await import('../../db/schema/ops.ts')
  const [row] = await db
    .select({ n: count() })
    .from(auditLogs)
    .where(and(eq(auditLogs.entity, entity), gt(auditLogs.createdAt, since)))
  return Number(row?.n ?? 0)
}

// ─── Ficha de producto, variantes y categorías (G2 completo) ────────────────

export interface AdminVariant {
  readonly id: string
  readonly sku: string
  readonly size: string
  readonly color: string
  readonly priceCents: number
  readonly compareAtPriceCents: number | null
  readonly status: string
  readonly onHand: number
  readonly reserved: number
  readonly available: number
}

export interface AdminProductDetail {
  readonly id: string
  readonly slug: string
  readonly name: string
  readonly status: string
  readonly featured: boolean
  readonly publishedAt: Date | null
  readonly categoryId: string
  readonly shortDescription: string | null
  readonly description: string | null
  readonly seoTitle: string | null
  readonly seoDescription: string | null
  readonly variants: readonly AdminVariant[]
}

export async function getAdminProduct(
  actor: AdminActor | null,
  productId: string,
  db: Database = getDb(),
): Promise<AdminProductDetail> {
  assertPermission(actor, PERMISSIONS.productsRead)

  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1)
  if (!product) throw new AppError('NOT_FOUND', 'Producto inexistente')

  const variants = await db
    .select({
      id: productVariants.id,
      sku: productVariants.sku,
      size: productVariants.size,
      color: productVariants.color,
      priceCents: productVariants.priceCents,
      compareAtPriceCents: productVariants.compareAtPriceCents,
      status: productVariants.status,
      onHand: inventoryItems.onHand,
      reserved: inventoryItems.reserved,
    })
    .from(productVariants)
    .leftJoin(inventoryItems, eq(inventoryItems.variantId, productVariants.id))
    .where(eq(productVariants.productId, productId))
    .orderBy(asc(productVariants.color), asc(productVariants.size))

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    status: product.status,
    featured: product.featured,
    publishedAt: product.publishedAt,
    categoryId: product.categoryId,
    shortDescription: product.shortDescription,
    description: product.description,
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    variants: variants.map((variant) => {
      const onHand = variant.onHand ?? 0
      const reserved = variant.reserved ?? 0
      return {
        id: variant.id,
        sku: variant.sku,
        size: variant.size,
        color: variant.color,
        priceCents: variant.priceCents,
        compareAtPriceCents: variant.compareAtPriceCents,
        status: variant.status,
        onHand,
        reserved,
        available: onHand - reserved,
      }
    }),
  }
}

export interface VariantInput {
  readonly productId: string
  /** Si se indica, actualiza esa variante; si no, crea una nueva. */
  readonly id?: string
  readonly sku: string
  readonly size: string
  readonly color: string
  readonly priceCents: number
  readonly compareAtPriceCents?: number | null
  readonly status?: 'draft' | 'active' | 'archived'
}

/**
 * Crea o actualiza una variante. Al crearla **siempre** deja su fila de
 * existencias: una variante sin `inventory_items` se comporta como stock 0 y
 * sería imposible de vender sin pasar por otro sitio.
 */
export async function upsertAdminVariant(
  actor: AdminActor | null,
  input: VariantInput,
  db: Database = getDb(),
): Promise<{ id: string; created: boolean }> {
  assertPermission(actor, PERMISSIONS.productsWrite)
  if (!Number.isInteger(input.priceCents) || input.priceCents < 0) {
    throw new AppError('VALIDATION', 'El precio debe ser un entero en céntimos')
  }
  if (
    input.compareAtPriceCents != null &&
    input.compareAtPriceCents < input.priceCents
  ) {
    throw new AppError(
      'VALIDATION',
      'El precio tachado no puede ser menor que el precio actual',
    )
  }
  const audit = createPostgresAuditRepository(db)

  return db.transaction(async (tx) => {
    const [product] = await tx
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, input.productId))
      .limit(1)
    if (!product) throw new AppError('NOT_FOUND', 'Producto inexistente')

    // SKU repetido: se comprueba antes para dar un error claro (y la base lo
    // impide igualmente con su índice único).
    const duplicate = await tx
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(eq(productVariants.sku, input.sku.trim()))
      .limit(1)
    if (duplicate.length > 0 && duplicate[0]!.id !== input.id) {
      throw new AppError('CONFLICT', `Ya existe una variante con el SKU ${input.sku}`)
    }

    const values = {
      productId: input.productId,
      sku: input.sku.trim(),
      size: input.size.trim() || 'Única',
      color: input.color.trim(),
      priceCents: input.priceCents,
      compareAtPriceCents: input.compareAtPriceCents ?? null,
      status: input.status ?? 'draft',
    }

    if (input.id) {
      const [current] = await tx
        .select()
        .from(productVariants)
        .where(eq(productVariants.id, input.id))
        .for('update')
      if (!current) throw new AppError('NOT_FOUND', 'Variante inexistente')

      await tx
        .update(productVariants)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(productVariants.id, input.id))

      await audit.record({
        actorId: actor!.userId,
        actorKind: 'user',
        action: 'variant.update',
        entity: 'product_variants',
        entityId: input.id,
        before: { sku: current.sku, priceCents: current.priceCents, status: current.status },
        after: { sku: values.sku, priceCents: values.priceCents, status: values.status },
      })
      return { id: input.id, created: false }
    }

    const [created] = await tx
      .insert(productVariants)
      .values(values)
      .returning({ id: productVariants.id })

    await tx
      .insert(inventoryItems)
      .values({ variantId: created!.id, onHand: 0, reserved: 0, lowStockThreshold: 0 })
      .onConflictDoNothing({ target: inventoryItems.variantId })

    await audit.record({
      actorId: actor!.userId,
      actorKind: 'user',
      action: 'variant.create',
      entity: 'product_variants',
      entityId: created!.id,
      before: null,
      after: { sku: values.sku, priceCents: values.priceCents, color: values.color },
    })
    return { id: created!.id, created: true }
  })
}

/**
 * Borra una variante. Si algún pedido la referencia, la base lo impide
 * (`ON DELETE RESTRICT`) y aquí se traduce a un `CONFLICT` explicable: el
 * histórico comercial no se reescribe.
 */
export async function deleteAdminVariant(
  actor: AdminActor | null,
  variantId: string,
  db: Database = getDb(),
): Promise<{ deleted: boolean; archived: boolean }> {
  assertPermission(actor, PERMISSIONS.productsWrite)
  const audit = createPostgresAuditRepository(db)

  return db.transaction(async (tx) => {
    const [variant] = await tx
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, variantId))
      .for('update')
    if (!variant) throw new AppError('NOT_FOUND', 'Variante inexistente')

    const [used] = await tx
      .select({ n: count() })
      .from(orderItems)
      .where(eq(orderItems.variantId, variantId))
    if (Number(used?.n ?? 0) > 0) {
      throw new AppError(
        'CONFLICT',
        'La variante aparece en pedidos: archívela en lugar de borrarla',
      )
    }

    const [stock] = await tx
      .select({ onHand: inventoryItems.onHand, reserved: inventoryItems.reserved })
      .from(inventoryItems)
      .where(eq(inventoryItems.variantId, variantId))
      .limit(1)
    if (stock && (stock.onHand !== 0 || stock.reserved !== 0)) {
      throw new AppError(
        'CONFLICT',
        `No se borra una variante con stock (${stock.onHand} uds., ${stock.reserved} reservadas): ajústelo a cero primero`,
      )
    }

    // El ledger es append-only: si hay movimientos, el histórico comercial impide
    // borrar (la FK lo haría cumplir igualmente). Se archiva en su lugar.
    const [movements] = await tx
      .select({ n: count() })
      .from(inventoryMovements)
      .where(eq(inventoryMovements.variantId, variantId))
    if (Number(movements?.n ?? 0) > 0) {
      await tx
        .update(productVariants)
        .set({ status: 'archived', updatedAt: new Date() })
        .where(eq(productVariants.id, variantId))
      await audit.record({
        actorId: actor!.userId,
        actorKind: 'user',
        action: 'variant.archive',
        entity: 'product_variants',
        entityId: variantId,
        before: { status: variant.status },
        after: { status: 'archived', reason: 'tiene movimientos de inventario' },
      })
      return { deleted: false, archived: true }
    }

    await tx.delete(inventoryItems).where(eq(inventoryItems.variantId, variantId))
    await tx.delete(productVariants).where(eq(productVariants.id, variantId))

    await audit.record({
      actorId: actor!.userId,
      actorKind: 'user',
      action: 'variant.delete',
      entity: 'product_variants',
      entityId: variantId,
      before: { sku: variant.sku, priceCents: variant.priceCents },
      after: null,
    })
    return { deleted: true, archived: false }
  })
}

// ─── Categorías ─────────────────────────────────────────────────────────────

export interface AdminCategoryRow {
  readonly id: string
  readonly slug: string
  readonly name: string
  readonly parentId: string | null
  readonly position: number
  readonly status: string
  readonly productCount: number
}

export async function listAdminCategories(
  actor: AdminActor | null,
  db: Database = getDb(),
): Promise<AdminCategoryRow[]> {
  assertPermission(actor, PERMISSIONS.productsRead)
  const rows = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      parentId: categories.parentId,
      position: categories.position,
      status: categories.status,
      productCount: sql<number>`(select count(*)::int from products p where p.category_id = ${categories.id} and p.deleted_at is null)`,
    })
    .from(categories)
    .orderBy(asc(categories.position), asc(categories.name))
  return rows.map((row) => ({ ...row, productCount: Number(row.productCount) }))
}

export interface CategoryInput {
  readonly id?: string
  readonly parentId?: string | null
  readonly slug: string
  readonly name: string
  readonly description?: string | null
  readonly position?: number
  readonly status?: 'draft' | 'active' | 'archived'
}

/**
 * Crea o actualiza una categoría. Se rechaza crear un ciclo (una categoría que
 * sea antecesora de sí misma) porque dejaría el árbol inrecorrible.
 */
export async function upsertAdminCategory(
  actor: AdminActor | null,
  input: CategoryInput,
  db: Database = getDb(),
): Promise<{ id: string; created: boolean }> {
  assertPermission(actor, PERMISSIONS.productsWrite)
  const audit = createPostgresAuditRepository(db)

  return db.transaction(async (tx) => {
    if (input.parentId) {
      if (input.parentId === input.id) {
        throw new AppError('VALIDATION', 'Una categoría no puede ser su propio padre')
      }
      // Subir por la cadena de ancestros: si aparece el propio id, hay ciclo.
      let cursor: string | null = input.parentId
      const seen = new Set<string>()
      while (cursor) {
        if (cursor === input.id) {
          throw new AppError('CONFLICT', 'La jerarquía propuesta crea un ciclo')
        }
        if (seen.has(cursor)) break
        seen.add(cursor)
        const [parent] = await tx
          .select({ parentId: categories.parentId })
          .from(categories)
          .where(eq(categories.id, cursor))
          .limit(1)
        cursor = parent?.parentId ?? null
      }
    }

    const values = {
      parentId: input.parentId ?? null,
      slug: input.slug.trim(),
      name: input.name.trim(),
      description: input.description ?? null,
      position: input.position ?? 0,
      status: input.status ?? 'draft',
    }

    if (input.id) {
      const [current] = await tx
        .select()
        .from(categories)
        .where(eq(categories.id, input.id))
        .for('update')
      if (!current) throw new AppError('NOT_FOUND', 'Categoría inexistente')

      await tx
        .update(categories)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(categories.id, input.id))

      await audit.record({
        actorId: actor!.userId,
        actorKind: 'user',
        action: 'category.update',
        entity: 'categories',
        entityId: input.id,
        before: { slug: current.slug, name: current.name, status: current.status },
        after: { slug: values.slug, name: values.name, status: values.status },
      })
      return { id: input.id, created: false }
    }

    const [duplicate] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.slug, values.slug),
          input.parentId
            ? eq(categories.parentId, input.parentId)
            : sql`${categories.parentId} is null`,
        ),
      )
      .limit(1)
    if (duplicate) {
      throw new AppError('CONFLICT', `Ya existe la categoría ${values.slug} en ese nivel`)
    }

    const [created] = await tx
      .insert(categories)
      .values(values)
      .returning({ id: categories.id })

    await audit.record({
      actorId: actor!.userId,
      actorKind: 'user',
      action: 'category.create',
      entity: 'categories',
      entityId: created!.id,
      before: null,
      after: { slug: values.slug, name: values.name },
    })
    return { id: created!.id, created: true }
  })
}