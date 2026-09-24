/**
 * Dominio `inventory` — existencias, reservas y ledger de movimientos
 * (plan 01 §4). Convenciones en `identity.ts` (cabecera).
 *
 * Invariantes cubiertas aquí (§5.3 y §5.4):
 * - Nunca stock negativo (`on_hand >= 0`) ni sobre-reserva
 *   (`reserved <= on_hand`).
 * - `inventory_movements` es **append-only**: el rol de aplicación no tiene
 *   UPDATE/DELETE sobre esta tabla (se revocan en el runbook de permisos).
 * - Un ajuste manual siempre lleva motivo (`note`) — sin nota no hay excusa.
 */

import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { productVariants } from './catalog.ts'
import { users } from './identity.ts'
import { carts, orders } from './orders.ts'

/**
 * Una fila por variante: `variant_id` es a la vez PK y FK, así no puede haber
 * dos contadores de stock para el mismo SKU.
 */
export const inventoryItems = pgTable(
  'inventory_items',
  {
    variantId: uuid('variant_id')
      .primaryKey()
      .references(() => productVariants.id, { onDelete: 'restrict' }),
    onHand: bigint('on_hand', { mode: 'number' }).notNull().default(0),
    reserved: bigint('reserved', { mode: 'number' }).notNull().default(0),
    lowStockThreshold: bigint('low_stock_threshold', { mode: 'number' })
      .notNull()
      .default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Alerta de reposición: sólo las filas que ya están bajo el umbral.
    index('inventory_items_low_stock_idx')
      .on(t.variantId)
      .where(sql`${t.onHand} <= ${t.lowStockThreshold}`),
    check('inventory_items_on_hand_check', sql`${t.onHand} >= 0`),
    check('inventory_items_reserved_check', sql`${t.reserved} >= 0`),
    check(
      'inventory_items_reserved_within_on_hand_check',
      sql`${t.reserved} <= ${t.onHand}`,
    ),
    check('inventory_items_low_stock_threshold_check', sql`${t.lowStockThreshold} >= 0`),
  ],
)

export const inventoryReservations = pgTable(
  'inventory_reservations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),
    /** Reserva de checkout: nace del pedido. */
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'restrict' }),
    /** Reserva de carrito: nace del carrito (aún sin pedido). */
    cartId: uuid('cart_id').references(() => carts.id, { onDelete: 'restrict' }),
    quantity: bigint('quantity', { mode: 'number' }).notNull(),
    /** TTL: el job de limpieza libera las caducadas de forma idempotente. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    status: text('status').notNull().default('held'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Sólo las reservas vivas se consultan por caducidad.
    index('inventory_reservations_expires_at_idx')
      .on(t.expiresAt)
      .where(sql`${t.status} = 'held'`),
    index('inventory_reservations_variant_id_idx').on(t.variantId),
    index('inventory_reservations_order_id_idx').on(t.orderId),
    check('inventory_reservations_quantity_check', sql`${t.quantity} > 0`),
    check(
      'inventory_reservations_status_check',
      sql`${t.status} in ('held', 'committed', 'released', 'expired')`,
    ),
    check(
      'inventory_reservations_target_check',
      sql`${t.orderId} is not null or ${t.cartId} is not null`,
    ),
  ],
)

/** Ledger append-only: cada cambio de `on_hand` deja aquí su `delta` (§5.3). */
export const inventoryMovements = pgTable(
  'inventory_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),
    /** Positivo = entra, negativo = sale. Un movimiento de 0 no es un movimiento. */
    delta: bigint('delta', { mode: 'number' }).notNull(),
    reason: text('reason').notNull(),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'restrict' }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'restrict' }),
    /** Obligatoria si `reason = 'adjustment'` (ajuste manual justificado). */
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('inventory_movements_variant_created_idx').on(t.variantId, t.createdAt),
    index('inventory_movements_order_id_idx').on(t.orderId),
    check('inventory_movements_delta_check', sql`${t.delta} <> 0`),
    check(
      'inventory_movements_reason_check',
      sql`${t.reason} in ('purchase', 'order', 'return', 'adjustment', 'correction', 'release')`,
    ),
    check(
      'inventory_movements_adjustment_note_check',
      sql`${t.reason} <> 'adjustment' or ${t.note} is not null`,
    ),
  ],
)
