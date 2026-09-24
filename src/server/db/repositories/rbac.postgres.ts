/**
 * RBAC (plan 01 §4 `identity`, F4): los permisos se comprueban **en el
 * servidor**, siempre, y con la nomenclatura congelada `dominio:acción`
 * (`products:write`, `orders:refund`, `inventory:adjust`…).
 *
 * Regla dura: ocultar un botón no es seguridad. Cada server function
 * administrativa llama a `requirePermission` antes de tocar datos; si falta el
 * permiso, el error es `FORBIDDEN` y no se filtra ningún detalle.
 */

import { eq, inArray, sql } from 'drizzle-orm'
import { AppError } from '../../errors.ts'
import { getDb, type Database } from '../client.ts'
import {
  permissions,
  rolePermissions,
  roles,
  userRoles,
} from '../schema/identity.ts'

export interface RbacRepository {
  rolesForUser(userId: string): Promise<string[]>
  permissionsForUser(userId: string): Promise<string[]>
  hasPermission(userId: string, permission: string): Promise<boolean>
  /** Lanza `FORBIDDEN` si el usuario no tiene el permiso. */
  requirePermission(userId: string, permission: string): Promise<void>
}

export function createPostgresRbacRepository(db: Database = getDb()): RbacRepository {
  async function permissionsForUser(userId: string): Promise<string[]> {
    const rows = await db
      .selectDistinct({ key: permissions.key })
      .from(userRoles)
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(userRoles.userId, userId))
      .orderBy(permissions.key)
    return rows.map((row) => row.key)
  }

  return {
    async rolesForUser(userId) {
      const rows = await db
        .select({ key: roles.key })
        .from(userRoles)
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(eq(userRoles.userId, userId))
        .orderBy(roles.key)
      return rows.map((row) => row.key)
    },

    permissionsForUser,

    async hasPermission(userId, permission) {
      if (!permission.trim()) return false
      const rows = await db
        .select({ id: permissions.id })
        .from(userRoles)
        .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
        .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
        .where(
          sql`${userRoles.userId} = ${userId} and ${permissions.key} = ${permission}`,
        )
        .limit(1)
      return rows.length > 0
    },

    async requirePermission(userId, permission) {
      const granted = await db
        .select({ id: permissions.id })
        .from(userRoles)
        .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
        .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
        .where(
          sql`${userRoles.userId} = ${userId} and ${permissions.key} = ${permission}`,
        )
        .limit(1)

      if (granted.length === 0) {
        // Mensaje sin detalles: no se revela si el permiso existe o no.
        throw new AppError('FORBIDDEN', 'No tiene permiso para esta operación')
      }
    },
  }
}

/**
 * Utilidades de siembra/administración de permisos. Viven aquí y no en el
 * adaptador para que las usen tanto los tests como el futuro panel: crear un
 * rol, registrar permisos y concederlo a un usuario.
 */
export async function grantPermissionsToRole(
  input: {
    roleKey: string
    roleName?: string
    permissions: readonly string[]
    userId: string
    grantedBy?: string
  },
  db: Database = getDb(),
): Promise<void> {
  await db
    .insert(roles)
    .values({ key: input.roleKey, name: input.roleName ?? input.roleKey })
    .onConflictDoNothing({ target: roles.key })

  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.key, input.roleKey))
    .limit(1)

  if (input.permissions.length > 0) {
    await db
      .insert(permissions)
      .values(
        input.permissions.map((key) => ({
          key,
          description: `Permiso ${key}`,
        })),
      )
      .onConflictDoNothing({ target: permissions.key })

    const permissionRows = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(inArray(permissions.key, [...input.permissions]))

    await db
      .insert(rolePermissions)
      .values(permissionRows.map((row) => ({ roleId: role!.id, permissionId: row.id })))
      .onConflictDoNothing()
  }

  await db
    .insert(userRoles)
    .values({
      userId: input.userId,
      roleId: role!.id,
      grantedBy: input.grantedBy ?? null,
      grantedAt: new Date(),
    })
    .onConflictDoNothing()
}
