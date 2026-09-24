/**
 * Semilla de RBAC (Plan 02 §5): crea el catálogo de permisos y los cinco roles
 * con su matriz, de forma **idempotente**.
 *
 * Sin esto el panel no se puede usar: la semilla del Plan 01 creaba el rol
 * `admin` sin permisos, así que un administrador recibía `FORBIDDEN` en todo.
 */

import { eq, inArray } from 'drizzle-orm'
import { getDb, type Database } from '../client.ts'
import {
  permissions,
  rolePermissions,
  roles,
} from '../schema/identity.ts'
import {
  ALL_PERMISSIONS,
  ROLE_MATRIX,
  ROLE_NAMES,
  type RoleKey,
} from '../../services/admin/permissions.ts'

export interface RbacSeedResult {
  readonly permissions: number
  readonly roles: number
  readonly links: number
}

export async function seedRbac(db: Database = getDb()): Promise<RbacSeedResult> {
  // 1) Permisos: se crean y se actualiza la descripción si cambió.
  await db
    .insert(permissions)
    .values(
      ALL_PERMISSIONS.map((key) => ({
        key,
        description: `Permiso ${key}`,
      })),
    )
    .onConflictDoUpdate({
      target: permissions.key,
      set: { updatedAt: new Date() },
    })

  const permissionRows = await db
    .select({ id: permissions.id, key: permissions.key })
    .from(permissions)
    .where(inArray(permissions.key, [...ALL_PERMISSIONS]))
  const permissionIdByKey = new Map(permissionRows.map((row) => [row.key, row.id]))

  let links = 0
  const roleKeys = Object.keys(ROLE_MATRIX) as RoleKey[]

  for (const roleKey of roleKeys) {
    await db
      .insert(roles)
      .values({
        key: roleKey,
        name: ROLE_NAMES[roleKey],
        description: `Rol ${roleKey} (Plan 02 §5)`,
      })
      .onConflictDoUpdate({
        target: roles.key,
        set: { name: ROLE_NAMES[roleKey], updatedAt: new Date() },
      })

    const [role] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.key, roleKey))
      .limit(1)

    const linksForRole = ROLE_MATRIX[roleKey]
      .map((permission) => permissionIdByKey.get(permission))
      .filter((id): id is string => Boolean(id))

    if (linksForRole.length > 0) {
      await db
        .insert(rolePermissions)
        .values(linksForRole.map((permissionId) => ({ roleId: role!.id, permissionId })))
        .onConflictDoNothing()
      links += linksForRole.length
    }
  }

  return { permissions: ALL_PERMISSIONS.length, roles: roleKeys.length, links }
}

/**
 * Concede un rol a un usuario. `grantedBy` deja constancia de quién lo concedió
 * (la auditoría del cambio de permisos vive en `audit_logs`).
 */
export async function assignRoleToUser(
  input: { userId: string; roleKey: RoleKey; grantedBy?: string },
  db: Database = getDb(),
): Promise<void> {
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.key, input.roleKey))
    .limit(1)
  if (!role) throw new Error(`Rol inexistente: ${input.roleKey} (¿se ejecutó el seed?)`)

  const { userRoles } = await import('../schema/identity.ts')
  await db
    .insert(userRoles)
    .values({
      userId: input.userId,
      roleId: role.id,
      grantedBy: input.grantedBy ?? null,
      grantedAt: new Date(),
    })
    .onConflictDoNothing()
}
