/**
 * Cupones del storefront (Plan 03 §3).
 *
 * El cupón **se valida y se aplica siempre en el servidor**: el navegador sólo
 * envía el código. Los límites (total y por cliente) se cuentan dentro de la
 * transacción que crea el pedido, no al cotizar, porque entre la cotización y
 * el pedido otro usuario puede consumir la última unidad del cupón.
 *
 * Reglas puras separadas de la base (`couponDiscountCents`,
 * `assertCouponUsable`) para poder probarlas sin PostgreSQL.
 */

import { and, count, eq } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { couponRedemptions, coupons } from '../db/schema/promotions.ts'
import { orders as ordersTable } from '../db/schema/orders.ts'
import { AppError } from '../errors.ts'

export type CouponKind = 'percent' | 'fixed' | 'free_shipping'

export interface CouponToApply {
  readonly id: string
  readonly code: string
  readonly kind: CouponKind
  readonly value: number
  readonly minSubtotalCents: number
  readonly maxUses: number | null
  readonly maxUsesPerCustomer: number | null
  readonly startsAt: Date
  readonly endsAt: Date | null
  readonly status: string
}

/**
 * Descuento en céntimos que aplica el cupón sobre el subtotal.
 *
 * `free_shipping` no toca el subtotal: su efecto es poner el envío a cero, y
 * así `total = subtotal - descuento + envío + impuestos` sigue cuadrando.
 */
export function couponDiscountCents(
  kind: CouponKind,
  value: number,
  subtotalCents: number,
): number {
  if (subtotalCents <= 0) return 0
  if (kind === 'percent') {
    return Math.min(subtotalCents, Math.round((subtotalCents * value) / 100))
  }
  if (kind === 'fixed') {
    return Math.min(subtotalCents, value)
  }
  return 0
}

export interface CouponUsage {
  readonly totalRedemptions: number
  readonly customerRedemptions: number
}

/** Reglas puras de uso: vigencia, subtotal mínimo y límites. */
export function assertCouponUsable(
  coupon: CouponToApply,
  input: { subtotalCents: number; now?: Date; usage: CouponUsage },
): void {
  const now = input.now ?? new Date()
  if (coupon.status !== 'active') {
    throw new AppError('VALIDATION', `El cupón ${coupon.code} no está activo`)
  }
  if (now < coupon.startsAt) {
    throw new AppError('VALIDATION', `El cupón ${coupon.code} aún no está vigente`)
  }
  if (coupon.endsAt && now > coupon.endsAt) {
    throw new AppError('VALIDATION', `El cupón ${coupon.code} ha caducado`)
  }
  if (input.subtotalCents < coupon.minSubtotalCents) {
    throw new AppError(
      'VALIDATION',
      `El cupón ${coupon.code} requiere un subtotal mínimo de ${coupon.minSubtotalCents} céntimos`,
    )
  }
  if (coupon.maxUses !== null && input.usage.totalRedemptions >= coupon.maxUses) {
    throw new AppError('VALIDATION', `El cupón ${coupon.code} ya alcanzó su límite de usos`)
  }
  if (
    coupon.maxUsesPerCustomer !== null &&
    input.usage.customerRedemptions >= coupon.maxUsesPerCustomer
  ) {
    throw new AppError(
      'VALIDATION',
      `El cupón ${coupon.code} ya lo ha usado este cliente el máximo permitido`,
    )
  }
}

/** Lee un cupón por su código (normalizado a mayúsculas). */
export async function findCouponByCode(
  code: string,
  db: Database,
): Promise<CouponToApply | null> {
  const normalized = code.trim().toUpperCase()
  if (!normalized) return null
  const [row] = await db
    .select()
    .from(coupons)
    .where(eq(coupons.code, normalized))
    .limit(1)
  if (!row) return null
  // El esquema guarda `text` con CHECK; el tipo de dominio lo afina aquí.
  return { ...row, kind: row.kind as CouponKind }
}

/**
 * Usos del cupón: el total y los del cliente actual.
 *
 * El límite por cliente se resuelve contra la fila del pedido, no contra el
 * usuario: así también vale para la compra como invitado (mismo email).
 */
export async function countCouponUsage(
  couponId: string,
  identity: { customerId?: string | null; email?: string },
  db: Database,
): Promise<CouponUsage> {
  const [total] = await db
    .select({ n: count() })
    .from(couponRedemptions)
    .where(eq(couponRedemptions.couponId, couponId))

  const conditions = [eq(couponRedemptions.couponId, couponId)]
  if (identity.customerId) {
    conditions.push(eq(couponRedemptions.customerId, identity.customerId))
  } else if (identity.email) {
    conditions.push(eq(ordersTable.email, identity.email.trim().toLowerCase()))
  } else {
    // Sin identidad no hay límite por cliente que aplicar.
    return {
      totalRedemptions: Number(total?.n ?? 0),
      customerRedemptions: 0,
    }
  }

  const [perCustomer] = await db
    .select({ n: count() })
    .from(couponRedemptions)
    .innerJoin(ordersTable, eq(ordersTable.id, couponRedemptions.orderId))
    .where(and(...conditions))

  return {
    totalRedemptions: Number(total?.n ?? 0),
    customerRedemptions: Number(perCustomer?.n ?? 0),
  }
}

export interface ValidatedCoupon {
  readonly coupon: CouponToApply
  /** Céntimos a descontar del subtotal (`free_shipping` ⇒ 0). */
  readonly discountCents: number
}

/**
 * Valida un cupón para la cotización. Devuelve `null` si no se pidió código y
 * lanza `VALIDATION` con mensaje legible si el código no sirve: una tienda que
 * dice «cupón no válido» es mejor que un `CONFLICT` genérico.
 */
export async function validateCouponForQuote(
  code: string | undefined,
  subtotalCents: number,
  identity: { customerId?: string | null; email?: string },
  db: Database,
): Promise<ValidatedCoupon | null> {
  if (!code || !code.trim()) return null

  const coupon = await findCouponByCode(code, db)
  if (!coupon) {
    throw new AppError('VALIDATION', 'Ese código de descuento no existe')
  }
  const usage = await countCouponUsage(coupon.id, identity, db)
  assertCouponUsable(coupon, { subtotalCents, usage })
  return {
    coupon,
    discountCents: couponDiscountCents(coupon.kind, coupon.value, subtotalCents),
  }
}

