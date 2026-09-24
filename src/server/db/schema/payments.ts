/**
 * Dominio `payments` — pagos y eventos de proveedor (plan 01 §4).
 * Convenciones en `identity.ts` (cabecera).
 *
 * Invariantes cubiertas aquí:
 * - §5.9 — **ningún dato de tarjeta**: sólo referencia, estado e importes del
 *   proveedor. El PAN, el CVV y el token de tarjeta viven en el PSP, no aquí.
 * - Devoluciones acotadas: `refunded_cents <= amount_cents`.
 * - `UNIQUE(provider, provider_reference)` en `payments` y
 *   `UNIQUE(provider, provider_event_id)` en `payment_events`: un webhook
 *   repetido se convierte en no-op (idempotencia, §6).
 */

import { sql } from 'drizzle-orm'
import {
  bigint,
  char,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { orders } from './orders.ts'

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    /** `stripe`, `paypal`, `manual`, … */
    provider: text('provider').notNull(),
    /** Referencia del proveedor (payment intent, transaction id…). */
    providerReference: text('provider_reference').notNull(),
    /** Detalle libre del proveedor: `card`, `paypal`, `transfer`, … */
    method: text('method'),
    status: text('status').notNull().default('pending'),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    currency: char('currency', { length: 3 }).notNull().default('EUR'),
    refundedCents: bigint('refunded_cents', { mode: 'number' }).notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('payments_provider_reference_key').on(t.provider, t.providerReference),
    index('payments_order_id_idx').on(t.orderId),
    index('payments_status_idx').on(t.status),
    check('payments_provider_not_blank_check', sql`length(btrim(${t.provider})) > 0`),
    check(
      'payments_provider_reference_not_blank_check',
      sql`length(btrim(${t.providerReference})) > 0`,
    ),
    check(
      'payments_status_check',
      sql`${t.status} in ('pending', 'authorized', 'captured', 'failed', 'cancelled', 'refunded', 'partially_refunded')`,
    ),
    check('payments_amount_cents_check', sql`${t.amountCents} >= 0`),
    check('payments_refunded_cents_check', sql`${t.refundedCents} >= 0`),
    check(
      'payments_refunded_within_amount_check',
      sql`${t.refundedCents} <= ${t.amountCents}`,
    ),
  ],
)

/** Bandeja de entrada de webhooks: se inserta **antes** de procesar (§6). */
export const paymentEvents = pgTable(
  'payment_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: text('provider').notNull(),
    /** Id del evento según el proveedor: la clave de idempotencia del webhook. */
    providerEventId: text('provider_event_id').notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    /** Motivo del fallo si el procesamiento no terminó bien. */
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('payment_events_provider_event_id_key').on(t.provider, t.providerEventId),
    // Cola de pendientes: sólo los eventos sin procesar.
    index('payment_events_pending_idx')
      .on(t.createdAt)
      .where(sql`${t.processedAt} is null`),
    check('payment_events_provider_not_blank_check', sql`length(btrim(${t.provider})) > 0`),
    check(
      'payment_events_provider_event_id_not_blank_check',
      sql`length(btrim(${t.providerEventId})) > 0`,
    ),
    check('payment_events_type_not_blank_check', sql`length(btrim(${t.type})) > 0`),
  ],
)
