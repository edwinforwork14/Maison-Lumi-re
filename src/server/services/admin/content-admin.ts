/**
 * Ajustes, contenido y usuarios del panel (Plan 02, G5).
 *
 * Tres reglas que hacen que esto sea operación y no solo formularios:
 * 1. **Los ajustes se validan por tipo** antes de guardarse: un `site_settings`
 *    con `type='number'` no admite texto, porque el storefront lo consumirá
 *    confiando en su forma.
 * 2. **Toda mutación deja auditoría** con `before`/`after` selectivo.
 * 3. **No se puede dejar la tienda sin super administrador**: revocar el último
 *    `super_admin` se rechaza con `CONFLICT` (si no, nadie podría volver a
 *    conceder permisos).
 */

import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, type Database } from '../../db/client.ts'
import { banners, homepageSections, siteSettings } from '../../db/schema/content.ts'
import { roles, sessions, userRoles, users } from '../../db/schema/identity.ts'
import { createPostgresAuditRepository } from '../../db/repositories/audit.postgres.ts'
import { AppError } from '../../errors.ts'
import { assertPermission, type AdminActor } from './actor.ts'
import { PERMISSIONS } from './permissions.ts'

// ─── Ajustes del sitio ──────────────────────────────────────────────────────

/** Valor de ajuste: JSON serializable, no `unknown` (la frontera lo exige). */
export type SettingValue = string | number | boolean | Record<string, string | number | boolean>

export interface AdminSettingRow {
  readonly key: string
  readonly value: SettingValue
  readonly type: string
  readonly updatedAt: Date
  readonly updatedBy: string | null
}

const settingValueSchemas = {
  string: z.string().min(1),
  number: z.number().finite(),
  boolean: z.boolean(),
  json: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
} as const

export type SettingType = keyof typeof settingValueSchemas

/** Valida el valor según el tipo declarado; error de `VALIDATION` si no encaja. */
export function validateSettingValue(type: string, value: SettingValue): SettingValue {
  const schema = settingValueSchemas[type as SettingType]
  if (!schema) {
    throw new AppError(
      'VALIDATION',
      `Tipo de ajuste desconocido: ${type}. Admitidos: ${Object.keys(settingValueSchemas).join(', ')}`,
    )
  }
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new AppError(
      'VALIDATION',
      `El valor no encaja con el tipo ${type}: ${parsed.error.issues[0]?.message ?? 'inválido'}`,
    )
  }
  return parsed.data as SettingValue
}

export async function listAdminSettings(
  actor: AdminActor | null,
  db: Database = getDb(),
): Promise<AdminSettingRow[]> {
  assertPermission(actor, PERMISSIONS.settingsRead)
  const rows = await db
    .select({
      key: siteSettings.key,
      value: siteSettings.value,
      type: siteSettings.type,
      updatedAt: siteSettings.updatedAt,
      updatedBy: siteSettings.updatedBy,
    })
    .from(siteSettings)
    .orderBy(asc(siteSettings.key))

  // La columna es `jsonb` (tipo `unknown` en el esquema): la forma la garantiza
  // la validación por tipo en la escritura, no una comprobación en cada lectura.
  return rows.map((row) => ({ ...row, value: row.value as SettingValue }))
}

export async function updateAdminSetting(
  actor: AdminActor | null,
  input: { key: string; value: SettingValue; type?: SettingType },
  db: Database = getDb(),
): Promise<AdminSettingRow> {
  assertPermission(actor, PERMISSIONS.settingsWrite)
  const key = input.key.trim()
  if (!key) throw new AppError('VALIDATION', 'El ajuste necesita una clave')
  const audit = createPostgresAuditRepository(db)

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.key, key))
      .for('update')

    const type = (input.type ?? (current?.type as SettingType) ?? 'json') as SettingType
    const value = validateSettingValue(type, input.value)

    if (current) {
      const [updated] = await tx
        .update(siteSettings)
        .set({ value, type, updatedBy: actor!.userId, updatedAt: new Date() })
        .where(eq(siteSettings.key, key))
        .returning()
      await audit.record({
        actorId: actor!.userId,
        actorKind: 'user',
        action: 'setting.update',
        entity: 'site_settings',
        entityId: key,
        before: { value: current.value, type: current.type },
        after: { value, type },
      })
      return {
        key: updated!.key,
        value: updated!.value as SettingValue,
        type: updated!.type,
        updatedAt: updated!.updatedAt,
        updatedBy: updated!.updatedBy,
      }
    }

    const [created] = await tx
      .insert(siteSettings)
      .values({ key, value, type, updatedBy: actor!.userId })
      .returning()
    await audit.record({
      actorId: actor!.userId,
      actorKind: 'user',
      action: 'setting.create',
      entity: 'site_settings',
      entityId: key,
      before: null,
      after: { value, type },
    })
    return {
      key: created!.key,
      value: created!.value as SettingValue,
      type: created!.type,
      updatedAt: created!.updatedAt,
      updatedBy: created!.updatedBy,
    }
  })
}

// ─── Contenido: secciones de portada y banners ──────────────────────────────

export interface AdminContentRow {
  readonly id: string
  readonly kind: 'section' | 'banner'
  readonly key: string
  readonly title: string | null
  readonly subtitle: string | null
  readonly ctaLabel: string | null
  readonly ctaHref: string | null
  readonly placement: string
  readonly position: number
  readonly status: string
}

export async function listAdminContent(
  actor: AdminActor | null,
  db: Database = getDb(),
): Promise<AdminContentRow[]> {
  assertPermission(actor, PERMISSIONS.contentRead)

  const sections = await db
    .select()
    .from(homepageSections)
    .orderBy(asc(homepageSections.placement), asc(homepageSections.position))
  const bannerRows = await db
    .select()
    .from(banners)
    .orderBy(asc(banners.placement), asc(banners.position))

  const toRow = (kind: 'section' | 'banner') => (row: typeof sections[number] | typeof bannerRows[number]) => ({
    id: row.id,
    kind,
    key: row.key,
    title: row.title,
    subtitle: row.subtitle,
    ctaLabel: row.ctaLabel,
    ctaHref: row.ctaHref,
    placement: row.placement,
    position: row.position,
    status: row.status,
  })

  return [
    ...sections.map(toRow('section')),
    ...bannerRows.map(toRow('banner')),
  ]
}

export interface ContentInput {
  readonly kind: 'section' | 'banner'
  readonly id?: string
  readonly key: string
  readonly title?: string | null
  readonly subtitle?: string | null
  readonly ctaLabel?: string | null
  readonly ctaHref?: string | null
  readonly placement?: string
  readonly position?: number
  /** El esquema de contenido usa published, no ctive. */
  readonly status?: 'draft' | 'published' | 'archived'
}

export async function upsertAdminContent(
  actor: AdminActor | null,
  input: ContentInput,
  db: Database = getDb(),
): Promise<{ id: string; created: boolean }> {
  assertPermission(actor, PERMISSIONS.contentWrite)
  if (!input.key.trim()) throw new AppError('VALIDATION', 'El contenido necesita una clave')
  if (input.ctaHref && !input.ctaHref.startsWith('/') && !/^https?:\/\//.test(input.ctaHref)) {
    throw new AppError(
      'VALIDATION',
      'El enlace del CTA debe ser una ruta interna (/shop) o una URL http(s)',
    )
  }
  const audit = createPostgresAuditRepository(db)
  const table = input.kind === 'section' ? homepageSections : banners

  return db.transaction(async (tx) => {
    const duplicate = await tx
      .select({ id: table.id })
      .from(table)
      .where(eq(table.key, input.key.trim()))
      .limit(1)
    if (duplicate.length > 0 && duplicate[0]!.id !== input.id) {
      throw new AppError('CONFLICT', `Ya existe contenido con la clave ${input.key}`)
    }

    const values = {
      key: input.key.trim(),
      title: input.title ?? null,
      subtitle: input.subtitle ?? null,
      ctaLabel: input.ctaLabel ?? null,
      ctaHref: input.ctaHref ?? null,
      placement: input.placement ?? (input.kind === 'section' ? 'home' : 'home_hero'),
      position: input.position ?? 0,
      status: input.status ?? 'draft',
    }

    if (input.id) {
      const [current] = await tx.select().from(table).where(eq(table.id, input.id)).for('update')
      if (!current) throw new AppError('NOT_FOUND', 'Contenido inexistente')
      await tx.update(table).set({ ...values, updatedAt: new Date() }).where(eq(table.id, input.id))
      await audit.record({
        actorId: actor!.userId,
        actorKind: 'user',
        action: `${input.kind}.update`,
        entity: input.kind === 'section' ? 'homepage_sections' : 'banners',
        entityId: input.id,
        before: { title: current.title, status: current.status, position: current.position },
        after: { title: values.title, status: values.status, position: values.position },
      })
      return { id: input.id, created: false }
    }

    const [created] = await tx.insert(table).values(values).returning({ id: table.id })
    await audit.record({
      actorId: actor!.userId,
      actorKind: 'user',
      action: `${input.kind}.create`,
      entity: input.kind === 'section' ? 'homepage_sections' : 'banners',
      entityId: created!.id,
      before: null,
      after: { key: values.key, title: values.title, status: values.status },
    })
    return { id: created!.id, created: true }
  })
}

// ─── Usuarios y roles ───────────────────────────────────────────────────────

export interface AdminUserRow {
  readonly userId: string
  readonly email: string
  readonly status: string
  readonly roleKeys: readonly string[]
  readonly lastLogin: Date | null
}

export async function listAdminUsers(
  actor: AdminActor | null,
  filters: { q?: string; limit?: number } = {},
  db: Database = getDb(),
): Promise<AdminUserRow[]> {
  assertPermission(actor, PERMISSIONS.usersManage)
  const conditions = []
  if (filters.q?.trim()) {
    conditions.push(sql`lower(${users.email}) like ${`%${filters.q.trim().toLowerCase()}%`}`)
  }

  const userRows = await db
    .select({ userId: users.id, email: users.email, status: users.status })
    .from(users)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(users.email))
    .limit(Math.min(filters.limit ?? 50, 200))

  const ids = userRows.map((row) => row.userId)
  if (ids.length === 0) return []

  // Se leen roles y sesiones en consultas aparte y se agrupan aquí: las
  // subconsultas correlacionadas con `array_agg` no se comportan igual vía el
  // constructor de consultas que en SQL directo, y esto es igual de explícito.
  const roleRows = await db
    .select({ userId: userRoles.userId, key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(inArray(userRoles.userId, ids))
    .orderBy(asc(roles.key))

  const loginRows = await db
    .select({
      userId: sessions.userId,
      lastLogin: sql<Date | null>`max(${sessions.createdAt})`,
    })
    .from(sessions)
    .where(inArray(sessions.userId, ids))
    .groupBy(sessions.userId)

  const rolesByUser = new Map<string, string[]>()
  for (const row of roleRows) {
    const list = rolesByUser.get(row.userId) ?? []
    list.push(row.key)
    rolesByUser.set(row.userId, list)
  }
  const loginByUser = new Map(loginRows.map((row) => [row.userId, row.lastLogin]))

  return userRows.map((row) => ({
    userId: row.userId,
    email: row.email,
    status: row.status,
    roleKeys: rolesByUser.get(row.userId) ?? [],
    lastLogin: loginByUser.get(row.userId) ? new Date(loginByUser.get(row.userId)!) : null,
  }))
}
/**
 * Regla del último super administrador. Es una función pura a propósito: se
 * puede probar sin base de datos y el servicio la aplica dentro de la
 * transacción con el recuento real.
 */
export function assertNotLastSuperAdmin(input: {
  roleKey: string
  remainingActive: number
  holdsRole: boolean
}): void {
  if (input.roleKey !== 'super_admin') return
  if (!input.holdsRole) return
  if (input.remainingActive > 1) return
  throw new AppError(
    'CONFLICT',
    'No se puede revocar el último super administrador activo: nadie podría volver a conceder permisos',
  )
}

/** Cuántos usuarios activos tienen el rol indicado (para no quedarse sin admins). */
async function countUsersWithRole(roleKey: string, db: Database): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(roles.key, roleKey), eq(users.status, 'active')))
  return Number(row?.total ?? 0)
}

export async function assignAdminRole(
  actor: AdminActor | null,
  input: { userId: string; roleKey: string },
  db: Database = getDb(),
): Promise<{ ok: true }> {
  assertPermission(actor, PERMISSIONS.usersManage)
  const audit = createPostgresAuditRepository(db)

  return db.transaction(async (tx) => {
    const [role] = await tx.select().from(roles).where(eq(roles.key, input.roleKey)).limit(1)
    if (!role) throw new AppError('NOT_FOUND', `Rol inexistente: ${input.roleKey}`)
    const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).limit(1)
    if (!user) throw new AppError('NOT_FOUND', 'Usuario inexistente')

    await tx
      .insert(userRoles)
      .values({
        userId: input.userId,
        roleId: role.id,
        grantedBy: actor!.userId,
        grantedAt: new Date(),
      })
      .onConflictDoNothing()

    await audit.record({
      actorId: actor!.userId,
      actorKind: 'user',
      action: 'user.role_grant',
      entity: 'user_roles',
      entityId: input.userId,
      before: null,
      after: { roleKey: input.roleKey },
    })
    return { ok: true as const }
  })
}

/**
 * Revoca un rol. Nunca deja la tienda sin `super_admin` activo: es la diferencia
 * entre un permiso revocado y un sistema que nadie puede volver a administrar.
 */
export async function revokeAdminRole(
  actor: AdminActor | null,
  input: { userId: string; roleKey: string },
  db: Database = getDb(),
): Promise<{ ok: true }> {
  assertPermission(actor, PERMISSIONS.usersManage)
  const audit = createPostgresAuditRepository(db)

  return db.transaction(async (tx) => {
    const [role] = await tx.select().from(roles).where(eq(roles.key, input.roleKey)).limit(1)
    if (!role) throw new AppError('NOT_FOUND', `Rol inexistente: ${input.roleKey}`)

    const remaining = await countUsersWithRole(input.roleKey, tx as unknown as Database)
    const [current] = await tx
      .select({ id: userRoles.userId })
      .from(userRoles)
      .where(and(eq(userRoles.userId, input.userId), eq(userRoles.roleId, role.id)))
      .limit(1)
    assertNotLastSuperAdmin({
      roleKey: input.roleKey,
      remainingActive: remaining,
      holdsRole: current !== undefined,
    })

    const deleted = await tx
      .delete(userRoles)
      .where(and(eq(userRoles.userId, input.userId), eq(userRoles.roleId, role.id)))
      .returning({ userId: userRoles.userId })
    if (deleted.length === 0) {
      throw new AppError('NOT_FOUND', 'El usuario no tiene ese rol')
    }

    await audit.record({
      actorId: actor!.userId,
      actorKind: 'user',
      action: 'user.role_revoke',
      entity: 'user_roles',
      entityId: input.userId,
      before: { roleKey: input.roleKey },
      after: null,
    })
    return { ok: true as const }
  })
}

/** Roles disponibles para el selector del panel. */
export async function listAdminRoles(
  actor: AdminActor | null,
  db: Database = getDb(),
): Promise<Array<{ key: string; name: string; permissionCount: number }>> {
  assertPermission(actor, PERMISSIONS.usersManage)
  const rows = await db
    .select({
      key: roles.key,
      name: roles.name,
      permissionCount: sql<number>`(select count(*)::int from role_permissions rp where rp.role_id = ${roles.id})`,
    })
    .from(roles)
    .orderBy(asc(roles.key))
  return rows.map((row) => ({ ...row, permissionCount: Number(row.permissionCount) }))
}

