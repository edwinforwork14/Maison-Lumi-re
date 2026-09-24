/**
 * Actor administrativo (Plan 02 §3–§5).
 *
 * El actor se resuelve **en el servidor** a partir de la cookie de sesión
 * (`kind = 'admin'`) y trae sus permisos ya cargados, de modo que cada
 * operación comprueba una pertenencia en memoria y no una consulta extra.
 *
 * Nada de esto vive en el cliente: la UI puede ocultar un botón, pero el
 * permiso se verifica aquí o la operación no ocurre.
 */

import { getDb, type Database } from '../../db/client.ts'
import { createPostgresRbacRepository } from '../../db/repositories/rbac.postgres.ts'
import {
  createPostgresSessionsRepository,
  resolveSessionSecret,
} from '../../db/repositories/sessions.postgres.ts'
import { AppError } from '../../errors.ts'
import type { Permission } from './permissions.ts'

export interface AdminActor {
  readonly userId: string
  readonly sessionId: string
  readonly permissions: readonly string[]
}

/** Nombre de la cookie de administración (separada de la de tienda). */
export const ADMIN_SESSION_COOKIE = 'ml.admin.session'

/**
 * Resuelve el actor a partir del valor de la cookie. Devuelve `null` si no hay
 * sesión, si está caducada, si la firma no cuadra o si la sesión **no es de
 * administración**: una sesión de tienda nunca abre el panel.
 */
export async function resolveAdminActor(
  cookieValue: string | null | undefined,
  db: Database = getDb(),
  secret: string = resolveSessionSecret(),
): Promise<AdminActor | null> {
  const sessions = createPostgresSessionsRepository(db, secret)
  const session = await sessions.resolve(cookieValue)
  if (!session || session.kind !== 'admin') return null

  const rbac = createPostgresRbacRepository(db)
  const permissions = await rbac.permissionsForUser(session.userId)
  return { userId: session.userId, sessionId: session.id, permissions }
}

/** Comprueba el permiso y devuelve el actor, o lanza el error que corresponde. */
export function assertPermission(
  actor: AdminActor | null,
  permission: Permission,
): AdminActor {
  if (!actor) {
    throw new AppError('UNAUTHENTICATED', 'Se requiere sesión de administración')
  }
  if (!actor.permissions.includes(permission)) {
    throw new AppError('FORBIDDEN', 'No tiene permiso para esta operación')
  }
  return actor
}

/** Atajo: resuelve y exige permiso en una sola llamada. */
export async function requireActor(
  cookieValue: string | null | undefined,
  permission: Permission,
  db: Database = getDb(),
  secret: string = resolveSessionSecret(),
): Promise<AdminActor> {
  const actor = await resolveAdminActor(cookieValue, db, secret)
  return assertPermission(actor, permission)
}
