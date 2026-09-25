/**
 * Cupones y reseñas del panel (Plan 02, G5).
 *
 * Reglas que hacen de esto operación y no solo formularios:
 * 1. **La validación es por tipo de cupón**: un `percent` entre 1 y 100, un
 *    `fixed` en céntimos positivo y un `free_shipping` sin valor. El CHECK de la
 *    base también existe, pero el error aquí es legible y no llega como
 *    violación de constraint.
 * 2. **Un canje por pedido** (`UNIQUE(coupon_id, order_id)`) y los límites se
 *    cuentan en la transacción de checkout, nunca al editar el cupón.
 * 3. **Sólo `approved` es visible en la tienda**: moderar una reseña cambia su
 *    estado y deja `moderated_by`/`moderated_at` + fila de auditoría.
 */

import { and, asc, desc, eq, gt, lt, or, sql } from 'drizzle-orm'
import { getDb, type Database } from '../../db/client.ts'
import { clampPageSize, decodeCursor, paginate, type Page } from '../../db/pagination.ts'
import { coupons, couponRedemptions } from '../../db/schema/promotions.ts'
import { reviews } from '../../db/schema/social.ts'
import { products } from '../../db/schema/catalog.ts'
import { createPostgresAuditRepository } from '../../db/repositories/audit.postgres.ts'
import { AppError } from '../../errors.ts'
import { assertPermission, type AdminActor } from './actor.ts'
import { PERMISSIONS } from './permissions.ts'

// ─── Cupones ───────────────────────────────────────────────────────────────

export type CouponKind = 'percent' | 'fixed' | 'free_shipping'
export type CouponStatus = 'active' | 'paused' | 'expired' | 'archived'

export interface AdminCouponRow {
  readonly id: string
  readonly code: string
  readonly kind: CouponKind
  readonly value: number
  readonly minSubtotalCents: number
  readonly maxUses: number | null
  readonly maxUsesPerCustomer: number | null
  readonly startsAt: Date
  readonly endsAt: Date | null
  readonly status: CouponStatus
  readonly redemptionCount: number
  readonly updatedAt: Date
}

export interface ListCouponsFilters {
  readonly q?: string
  readonly status?: CouponStatus
  readonly cursor?: string | null
  readonly size?: number
}

export async function listAdminCoupons(
  actor: AdminActor | null,
  filters: ListCouponsFilters = {},
  db: Database = getDb(),
): Promise<Page<AdminCouponRow>> {
  assertPermission(actor, PERMISSIONS.couponsRead)
  const limit = clampPageSize(filters.size)
  const conditions = []
  if (filters.q?.trim()) {
    conditions.push(sql`upper(${coupons.code}) like ${`%${filters.q.trim().toUpperCase()}%`}`)
  }
  if (filters.status) conditions.push(eq(coupons.status, filters.status))

  const decoded = decodeCursor(filters.cursor)
  if (decoded) {
    const cursorDate = new Date(decoded.k)
    if (!Number.isNaN(cursorDate.getTime())) {
      conditions.push(
        or(
          lt(coupons.updatedAt, cursorDate),
          and(eq(coupons.updatedAt, cursorDate), gt(coupons.id, decoded.id))!,
        )!,
      )
    }
  }

  // `limit + 1` filas: la extra dice si hay página siguiente sin un count.
  const rows = await db
    .select({
      id: coupons.id,
      code: coupons.code,
      kind: coupons.kind,
      value: coupons.value,
      minSubtotalCents: coupons.minSubtotalCents,
      maxUses: coupons.maxUses,
      maxUsesPerCustomer: coupons.maxUsesPerCustomer,
      startsAt: coupons.startsAt,
      endsAt: coupons.endsAt,
      status: coupons.status,
      updatedAt: coupons.updatedAt,
      redemptionCount: sql<number>`(
        select count(*)::int from coupon_redemptions cr where cr.coupon_id = ${coupons.id}
      )`,
    })
    .from(coupons)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(coupons.updatedAt), asc(coupons.id))
    .limit(limit + 1)

  return paginate(
    rows.map((row) => ({
      ...row,
      kind: row.kind as CouponKind,
      status: row.status as CouponStatus,
      redemptionCount: Number(row.redemptionCount),
    })),
    limit,
    (row) => row.updatedAt.toISOString(),
    (row) => row.id,
  )
}

export interface CouponInput {
  readonly id?: string
  readonly code: string
  readonly kind: CouponKind
  readonly value: number
  readonly minSubtotalCents?: number
  readonly maxUses?: number | null
  readonly maxUsesPerCustomer?: number | null
  readonly startsAt?: Date
  readonly endsAt?: Date | null
  readonly status?: CouponStatus
}

/**
 * Regla pura de validación por tipo: se prueba sin base de datos y el servicio
 * la aplica antes de tocar nada, para que el error sea de `VALIDATION` y no una
 * violación de CHECK llegando desde Postgres.
 */
export function assertCouponValueMatchesKind(kind: CouponKind, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new AppError('VALIDATION', 'El valor del cupón debe ser un entero no negativo')
  }
  if (kind === 'percent' && (value < 1 || value > 100)) {
    throw new AppError('VALIDATION', 'Un cupón por porcentaje vale entre 1 y 100')
  }
  if (kind === 'fixed' && value <= 0) {
    throw new AppError('VALIDATION', 'Un cupón fijo necesita un importe en céntimos mayor que cero')
  }
  if (kind === 'free_shipping' && value !== 0) {
    throw new AppError('VALIDATION', 'El cupón de envío gratuito no lleva valor')
  }
}

/** El código se guarda normalizado en mayúsculas (`UNIQUE(code)`). */
export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase()
}

export async function upsertAdminCoupon(
  actor: AdminActor | null,
  input: CouponInput,
  db: Database = getDb(),
): Promise<{ id: string; created: boolean }> {
  assertPermission(actor, PERMISSIONS.couponsWrite)
  assertCouponValueMatchesKind(input.kind, input.value)

  const code = normalizeCouponCode(input.code)
  if (!code) throw new AppError('VALIDATION', 'El cupón necesita un código')
  if (input.maxUses !== null && input.maxUses !== undefined && input.maxUses <= 0) {
    throw new AppError('VALIDATION', 'El límite total de usos debe ser mayor que cero')
  }
  if (
    input.maxUsesPerCustomer !== null &&
    input.maxUsesPerCustomer !== undefined &&
    input.maxUsesPerCustomer <= 0
  ) {
    throw new AppError('VALIDATION', 'El límite por cliente debe ser mayor que cero')
  }
  const startsAt = input.startsAt ?? new Date()
  if (input.endsAt && input.endsAt.getTime() <= startsAt.getTime()) {
    throw new AppError('VALIDATION', 'El fin de la vigencia debe ser posterior al inicio')
  }

  const audit = createPostgresAuditRepository(db)

  return db.transaction(async (tx) => {
    const duplicate = await tx
      .select({ id: coupons.id })
      .from(coupons)
      .where(eq(coupons.code, code))
      .limit(1)
    if (duplicate.length > 0 && duplicate[0]!.id !== input.id) {
      throw new AppError('CONFLICT', `Ya existe el cupón ${code}`)
    }

    const values = {
      code,
      kind: input.kind,
      value: input.value,
      minSubtotalCents: input.minSubtotalCents ?? 0,
      maxUses: input.maxUses ?? null,
      maxUsesPerCustomer: input.maxUsesPerCustomer ?? null,
      startsAt,
      endsAt: input.endsAt ?? null,
      status: input.status ?? 'active',
    }

    if (input.id) {
      const [current] = await tx.select().from(coupons).where(eq(coupons.id, input.id)).for('update')
      if (!current) throw new AppError('NOT_FOUND', 'Cupón inexistente')
      await tx.update(coupons).set({ ...values, updatedAt: new Date() }).where(eq(coupons.id, input.id))
      await audit.record({
        actorId: actor!.userId,
        actorKind: 'user',
        action: 'coupon.update',
        entity: 'coupons',
        entityId: input.id,
        before: { code: current.code, kind: current.kind, value: current.value, status: current.status },
        after: { code: values.code, kind: values.kind, value: values.value, status: values.status },
      })
      return { id: input.id, created: false }
    }

    const [created] = await tx.insert(coupons).values(values).returning({ id: coupons.id })
    await audit.record({
      actorId: actor!.userId,
      actorKind: 'user',
      action: 'coupon.create',
      entity: 'coupons',
      entityId: created!.id,
      before: null,
      after: { code: values.code, kind: values.kind, value: values.value },
    })
    return { id: created!.id, created: true }
  })
}

export async function setAdminCouponStatus(
  actor: AdminActor | null,
  input: { id: string; status: CouponStatus },
  db: Database = getDb(),
): Promise<{ status: CouponStatus }> {
  assertPermission(actor, PERMISSIONS.couponsWrite)
  const audit = createPostgresAuditRepository(db)

  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(coupons).where(eq(coupons.id, input.id)).for('update')
    if (!current) throw new AppError('NOT_FOUND', 'Cupón inexistente')

    const [updated] = await tx
      .update(coupons)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(coupons.id, input.id))
      .returning({ status: coupons.status })

    await audit.record({
      actorId: actor!.userId,
      actorKind: 'user',
      action: 'coupon.status',
      entity: 'coupons',
      entityId: input.id,
      before: { status: current.status },
      after: { status: input.status },
    })
    return { status: updated!.status as CouponStatus }
  })
}

/** Canjes de un cupón, para la pantalla de detalle (usos vs. límite). */
export async function listCouponRedemptions(
  actor: AdminActor | null,
  couponId: string,
  db: Database = getDb(),
): Promise<Array<{ orderId: string; amountCents: number; createdAt: Date }>> {
  assertPermission(actor, PERMISSIONS.couponsRead)
  const rows = await db
    .select({
      orderId: couponRedemptions.orderId,
      amountCents: couponRedemptions.amountCents,
      createdAt: couponRedemptions.createdAt,
    })
    .from(couponRedemptions)
    .where(eq(couponRedemptions.couponId, couponId))
    .orderBy(desc(couponRedemptions.createdAt))
    .limit(200)
  return rows
}

// ─── Reseñas ───────────────────────────────────────────────────────────────

export type ReviewStatus = 'pending' | 'approved' | 'rejected'

export interface AdminReviewRow {
  readonly id: string
  readonly productId: string
  readonly productName: string
  readonly rating: number
  readonly title: string | null
  readonly body: string | null
  readonly status: ReviewStatus
  readonly createdAt: Date
  readonly moderatedAt: Date | null
}

export interface ListReviewsFilters {
  readonly status?: ReviewStatus
  readonly productId?: string
  readonly cursor?: string | null
  readonly size?: number
}

export async function listAdminReviews(
  actor: AdminActor | null,
  filters: ListReviewsFilters = {},
  db: Database = getDb(),
): Promise<Page<AdminReviewRow>> {
  assertPermission(actor, PERMISSIONS.reviewsModerate)
  const limit = clampPageSize(filters.size)
  const conditions = []
  if (filters.status) conditions.push(eq(reviews.status, filters.status))
  if (filters.productId) conditions.push(eq(reviews.productId, filters.productId))

  const decoded = decodeCursor(filters.cursor)
  if (decoded) {
    const cursorDate = new Date(decoded.k)
    if (!Number.isNaN(cursorDate.getTime())) {
      conditions.push(
        or(
          lt(reviews.createdAt, cursorDate),
          and(eq(reviews.createdAt, cursorDate), gt(reviews.id, decoded.id))!,
        )!,
      )
    }
  }

  const rows = await db
    .select({
      id: reviews.id,
      productId: reviews.productId,
      productName: products.name,
      rating: reviews.rating,
      title: reviews.title,
      body: reviews.body,
      status: reviews.status,
      createdAt: reviews.createdAt,
      moderatedAt: reviews.moderatedAt,
    })
    .from(reviews)
    .innerJoin(products, eq(products.id, reviews.productId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(reviews.createdAt), asc(reviews.id))
    .limit(limit + 1)

  return paginate(
    rows.map((row) => ({ ...row, status: row.status as ReviewStatus })),
    limit,
    (row) => row.createdAt.toISOString(),
    (row) => row.id,
  )
}

export async function moderateAdminReview(
  actor: AdminActor | null,
  input: { id: string; status: ReviewStatus; note?: string },
  db: Database = getDb(),
): Promise<{ status: ReviewStatus }> {
  assertPermission(actor, PERMISSIONS.reviewsModerate)
  const audit = createPostgresAuditRepository(db)

  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(reviews).where(eq(reviews.id, input.id)).for('update')
    if (!current) throw new AppError('NOT_FOUND', 'Reseña inexistente')

    const [updated] = await tx
      .update(reviews)
      .set({
        status: input.status,
        moderatedBy: actor!.userId,
        moderatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(reviews.id, input.id))
      .returning({ status: reviews.status })

    await audit.record({
      actorId: actor!.userId,
      actorKind: 'user',
      action: 'review.moderate',
      entity: 'reviews',
      entityId: input.id,
      before: { status: current.status },
      // La nota del moderador queda en la traza, no en la reseña pública.
      after: { status: input.status, note: input.note ?? null },
    })
    return { status: updated!.status as ReviewStatus }
  })
}
