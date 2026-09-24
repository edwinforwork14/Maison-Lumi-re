/**
 * Dominio `ops` — auditoría e idempotencia (plan 01 §4 y §6).
 * Convenciones en `identity.ts` (cabecera).
 *
 * Invariantes cubiertas aquí:
 * - `audit_logs` es **append-only**: el rol de la app no tiene UPDATE/DELETE
 *   (se revoca en el runbook de permisos). Toda mutación sensible deja fila
 *   (§10-F4) con `before`/`after` en `jsonb` y su `request_id` para trazarlo.
 * - `idempotency_keys` guarda el **hash del payload**: misma clave + payload
 *   distinto ⇒ `CONFLICT` (§6). La respuesta original se devuelve desde
 *   `response`.
 */

import { sql } from 'drizzle-orm'
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { users } from './identity.ts'
import { orders } from './orders.ts'

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** NULL si el actor ya no existe o es anónimo. */
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'restrict' }),
    actorKind: text('actor_kind').notNull(),
    /** Verbo de negocio: `product.update`, `coupon.create`, `order.refund`, … */
    action: text('action').notNull(),
    /** Entidad afectada: `products`, `coupons`, … */
    entity: text('entity').notNull(),
    /** Id de la fila afectada (texto: sirve para PK no uuid). */
    entityId: text('entity_id'),
    before: jsonb('before').$type<Record<string, unknown>>(),
    after: jsonb('after').$type<Record<string, unknown>>(),
    requestId: text('request_id'),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_logs_entity_entity_id_idx').on(t.entity, t.entityId),
    index('audit_logs_created_at_idx').on(t.createdAt.desc()),
    index('audit_logs_actor_id_idx').on(t.actorId),
    check('audit_logs_actor_kind_check', sql`${t.actorKind} in ('user', 'system', 'webhook')`),
    check('audit_logs_action_not_blank_check', sql`length(btrim(${t.action})) > 0`),
    check('audit_logs_entity_not_blank_check', sql`length(btrim(${t.entity})) > 0`),
  ],
)

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    /** Clave enviada por el cliente (cabecera `Idempotency-Key`). */
    key: text('key').primaryKey(),
    /** Ámbito: `checkout.place`, `payment.webhook`, … */
    scope: text('scope').notNull(),
    /** Huella del payload: misma clave con payload distinto ⇒ CONFLICT. */
    requestHash: text('request_hash').notNull(),
    /** Respuesta original serializada, para reintentos idénticos. */
    response: jsonb('response').$type<Record<string, unknown>>(),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'restrict' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idempotency_keys_expires_at_idx').on(t.expiresAt),
    index('idempotency_keys_order_id_idx').on(t.orderId),
    check('idempotency_keys_key_not_blank_check', sql`length(btrim(${t.key})) > 0`),
    check('idempotency_keys_scope_not_blank_check', sql`length(btrim(${t.scope})) > 0`),
    check(
      'idempotency_keys_request_hash_not_blank_check',
      sql`length(btrim(${t.requestHash})) > 0`,
    ),
  ],
)
