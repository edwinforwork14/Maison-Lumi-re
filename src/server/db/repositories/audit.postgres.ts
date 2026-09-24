/**
 * Auditoría (plan 01 §10 de las fases / §4 `ops`).
 *
 * Toda mutación sensible deja fila en `audit_logs`: quién, qué acción, sobre
 * qué entidad, con `before`/`after` **selectivo** (nunca el payload entero) y
 * el `request_id` para poder correlacionar con los logs.
 *
 * La tabla es append-only: aquí sólo se escribe y se lista; no hay update ni
 * delete (y el rol de aplicación no los tiene en producción).
 */

import { and, desc, eq } from 'drizzle-orm'
import { getDb, type Database } from '../client.ts'
import { auditLogs } from '../schema/ops.ts'

export type ActorKind = 'user' | 'system' | 'webhook'

export interface AuditEntry {
  readonly actorId?: string | null
  readonly actorKind: ActorKind
  /** Verbo de negocio: `product.update`, `inventory.adjust`, `order.refund`… */
  readonly action: string
  /** Tabla afectada: `products`, `orders`, `site_settings`… */
  readonly entity: string
  readonly entityId?: string | null
  /** Sólo los campos relevantes, no la fila completa. */
  readonly before?: Record<string, unknown> | null
  readonly after?: Record<string, unknown> | null
  readonly requestId?: string | null
  readonly ip?: string | null
}

export interface AuditRepository {
  record(entry: AuditEntry): Promise<string>
  listByEntity(
    entity: string,
    entityId: string,
    limit?: number,
  ): Promise<Array<{ action: string; createdAt: Date; actorKind: string }>>
}

export function createPostgresAuditRepository(db: Database = getDb()): AuditRepository {
  return {
    async record(entry) {
      if (!entry.action.trim() || !entry.entity.trim()) {
        throw new RangeError('La auditoría exige `action` y `entity`')
      }
      const [row] = await db
        .insert(auditLogs)
        .values({
          actorId: entry.actorId ?? null,
          actorKind: entry.actorKind,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          before: entry.before ?? null,
          after: entry.after ?? null,
          requestId: entry.requestId ?? null,
          ip: entry.ip ?? null,
        })
        .returning({ id: auditLogs.id })
      return row!.id
    },

    async listByEntity(entity, entityId, limit = 50) {
      const rows = await db
        .select({
          action: auditLogs.action,
          createdAt: auditLogs.createdAt,
          actorKind: auditLogs.actorKind,
        })
        .from(auditLogs)
        .where(and(eq(auditLogs.entity, entity), eq(auditLogs.entityId, entityId)))
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit)
      return rows
    },
  }
}
