/**
 * Dominio `promotions` — cupones y canjes (plan 01 §4).
 * Convenciones en `identity.ts` (cabecera).
 *
 * Invariantes cubiertas aquí:
 * - `kind` en `('percent','fixed','free_shipping')` con CHECK (§3, sin `pg_enum`).
 * - Un `percent` sólo puede valer entre 1 y 100: un 150 % no existe.
 * - Vigencia coherente: `ends_at IS NULL OR ends_at > starts_at`.
 * - `UNIQUE(coupon_id, order_id)`: un pedido no consume el mismo cupón dos
 *   veces (invariante §5.10). Los límites total y por cliente se cuentan en la
 *   misma transacción que crea el pedido (§6), no aquí.
 */

import { sql } from 'drizzle-orm'
import {
  bigint,
  char,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { customers } from './identity.ts'
import { orders } from './orders.ts'

export const coupons = pgTable(
  'coupons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Se guarda normalizado en mayúsculas; `UNIQUE(code)` (invariante §5.2). */
    code: text('code').notNull(),
    kind: text('kind').notNull(),
    /** `percent` → 1..100; `fixed` → céntimos; `free_shipping` → 0. */
    value: bigint('value', { mode: 'number' }).notNull(),
    currency: char('currency', { length: 3 }).notNull().default('EUR'),
    minSubtotalCents: bigint('min_subtotal_cents', { mode: 'number' }).notNull().default(0),
    /** NULL = sin límite global. */
    maxUses: integer('max_uses'),
    /** NULL = sin límite por cliente. */
    maxUsesPerCustomer: integer('max_uses_per_customer'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('coupons_code_key').on(t.code),
    index('coupons_status_idx').on(t.status),
    index('coupons_window_idx').on(t.startsAt, t.endsAt),
    check('coupons_code_not_blank_check', sql`length(btrim(${t.code})) > 0`),
    check(
      'coupons_kind_check',
      sql`${t.kind} in ('percent', 'fixed', 'free_shipping')`,
    ),
    check('coupons_value_check', sql`${t.value} >= 0`),
    check(
      'coupons_percent_value_check',
      sql`${t.kind} <> 'percent' or ${t.value} between 1 and 100`,
    ),
    check(
      'coupons_fixed_value_check',
      sql`${t.kind} <> 'fixed' or ${t.value} > 0`,
    ),
    check('coupons_min_subtotal_cents_check', sql`${t.minSubtotalCents} >= 0`),
    check('coupons_max_uses_check', sql`${t.maxUses} is null or ${t.maxUses} > 0`),
    check(
      'coupons_max_uses_per_customer_check',
      sql`${t.maxUsesPerCustomer} is null or ${t.maxUsesPerCustomer} > 0`,
    ),
    check(
      'coupons_window_check',
      sql`${t.endsAt} is null or ${t.endsAt} > ${t.startsAt}`,
    ),
    check('coupons_status_check', sql`${t.status} in ('active', 'paused', 'expired', 'archived')`),
  ],
)

export const couponRedemptions = pgTable(
  'coupon_redemptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    couponId: uuid('coupon_id')
      .notNull()
      .references(() => coupons.id, { onDelete: 'restrict' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    /** Puede ser NULL si el pedido es de invitado sin cuenta. */
    customerId: uuid('customer_id').references(() => customers.id, {
      onDelete: 'restrict',
    }),
    /** Importe descontado (céntimos); hereda la moneda del pedido. */
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('coupon_redemptions_coupon_order_key').on(t.couponId, t.orderId),
    index('coupon_redemptions_customer_id_idx').on(t.customerId),
    // Conteo del límite por cliente dentro de la transacción de checkout.
    index('coupon_redemptions_coupon_customer_idx').on(t.couponId, t.customerId),
    check('coupon_redemptions_amount_cents_check', sql`${t.amountCents} >= 0`),
  ],
)
