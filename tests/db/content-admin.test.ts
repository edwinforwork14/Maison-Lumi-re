import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '../../src/server/db/schema/index.ts'
import { hashPassword } from '../../src/server/runtime/password-hasher.ts'
import { seedRbac, assignRoleToUser } from '../../src/server/db/seed/rbac.ts'
import { createPostgresSessionsRepository } from '../../src/server/db/repositories/sessions.postgres.ts'
import { resolveAdminActor } from '../../src/server/services/admin/actor.ts'
import {
  listAdminSettings,
  updateAdminSetting,
  validateSettingValue,
  listAdminContent,
  upsertAdminContent,
  listAdminUsers,
  listAdminRoles,
  assignAdminRole,
  revokeAdminRole,
  assertNotLastSuperAdmin,
} from '../../src/server/services/admin/content-admin.ts'
import { createPostgresAuditRepository } from '../../src/server/db/repositories/audit.postgres.ts'
import { ALL_PERMISSIONS, type RoleKey } from '../../src/server/services/admin/permissions.ts'

/**
 * Plan 02, G5: ajustes, contenido y usuarios/roles.
 *
 * Lo que se comprueba: la validación por tipo de los ajustes, el `CONFLICT` de
 * claves duplicadas en contenido, el enlace del CTA acotado, y que el rol
 * `admin` (que no tiene `users:manage`) no pueda tocar usuarios.
 */

const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL
if (!url) console.warn('[tests/db/content-admin] DATABASE_URL no definida: suite omitida.')
const suite = url ? describe : describe.skip

if (url) {
  const client = postgres(url, { max: 5, onnotice: () => {} })
  const db = drizzle(client, { schema })
  const SECRET = 'secreto-de-pruebas-contenido-con-mas-de-32-caracteres'

  after(async () => {
    await client.end({ timeout: 5 })
  })
  before(async () => {
    await seedRbac(db)
  })

  const token = () => Math.random().toString(36).slice(2, 10)

  async function actorWithRole(role: RoleKey) {
    const t = token()
    const [user] = await client<{ id: string }[]>`
      INSERT INTO users (email, password_hash)
      VALUES (${`cont-${role}-${t}@example.com`}, ${hashPassword('Cont-Pass-1234')}) RETURNING id`
    await assignRoleToUser({ userId: user!.id, roleKey: role }, db)
    const sessions = createPostgresSessionsRepository(db, SECRET)
    const issued = await sessions.issue({ userId: user!.id, kind: 'admin' })
    return { actor: await resolveAdminActor(issued.cookieValue, db, SECRET), userId: user!.id }
  }

  suite('ajustes: validación por tipo y auditoría', () => {
    it('valida el valor según el tipo declarado', () => {
      assert.equal(validateSettingValue('number', 42), 42)
      assert.equal(validateSettingValue('boolean', true), true)
      assert.equal(validateSettingValue('string', 'EUR'), 'EUR')
      assert.throws(() => validateSettingValue('number', 'cuarenta'), /tipo number/)
      assert.throws(() => validateSettingValue('boolean', 'sí'), /tipo boolean/)
      assert.throws(() => validateSettingValue('inventado', 1), /desconocido/)
    })

    it('crea y actualiza un ajuste dejando auditoría', async () => {
      const { actor } = await actorWithRole('super_admin')
      const key = `test.setting.${token()}`

      const created = await updateAdminSetting(
        actor,
        { key, value: 50_000, type: 'number' },
        db,
      )
      assert.equal(created.value, 50_000)
      assert.equal(created.type, 'number')

      const updated = await updateAdminSetting(
        actor,
        { key, value: 60_000, type: 'number' },
        db,
      )
      assert.equal(updated.value, 60_000)

      const audit = createPostgresAuditRepository(db)
      const entries = await audit.listByEntity('site_settings', key)
      assert.equal(entries.length, 2)
    })

    it('rechaza un valor que no encaja con su tipo', async () => {
      const { actor } = await actorWithRole('super_admin')
      const key = `test.bad.${token()}`
      await updateAdminSetting(actor, { key, value: 1_000, type: 'number' }, db)
      await assert.rejects(
        updateAdminSetting(actor, { key, value: 'mil', type: 'number' }, db),
        (error: unknown) => (error as { code?: string }).code === 'VALIDATION',
      )
    })

    it('`editor` no puede escribir ajustes; `admin` sí', async () => {
      const { actor: editor } = await actorWithRole('editor')
      const { actor: admin } = await actorWithRole('admin')
      await assert.rejects(
        updateAdminSetting(editor, { key: `x.${token()}`, value: 1, type: 'number' }, db),
        (error: unknown) => (error as { code?: string }).code === 'FORBIDDEN',
      )
      await assert.doesNotReject(listAdminSettings(admin, db))
    })
  })

  suite('contenido: secciones y banners con clave única', () => {
    it('crea una sección, la lista y la edita con auditoría', async () => {
      const { actor } = await actorWithRole('editor')
      const key = `hero-${token()}`

      const created = await upsertAdminContent(
        actor,
        {
          kind: 'section',
          key,
          title: 'Nueva temporada',
          ctaLabel: 'Descubrir',
          ctaHref: '/shop',
          status: 'published',
        },
        db,
      )
      assert.equal(created.created, true)

      const updated = await upsertAdminContent(
        actor,
        { kind: 'section', id: created.id, key, title: 'Nueva temporada 2026', position: 1 },
        db,
      )
      assert.equal(updated.created, false)

      const content = await listAdminContent(actor, db)
      const row = content.find((entry) => entry.id === created.id)
      assert.equal(row!.title, 'Nueva temporada 2026')
      assert.equal(row!.kind, 'section')

      const audit = createPostgresAuditRepository(db)
      const entries = await audit.listByEntity('homepage_sections', created.id)
      assert.equal(entries.length, 2)
    })

    it('rechaza clave duplicada con CONFLICT', async () => {
      const { actor } = await actorWithRole('editor')
      const key = `dup-${token()}`
      await upsertAdminContent(actor, { kind: 'banner', key, title: 'Uno' }, db)
      await assert.rejects(
        upsertAdminContent(actor, { kind: 'banner', key, title: 'Dos' }, db),
        (error: unknown) => (error as { code?: string }).code === 'CONFLICT',
      )
    })

    it('solo admite enlaces internos o http(s) en el CTA', async () => {
      const { actor } = await actorWithRole('editor')
      const key = `cta-${token()}`
      await assert.rejects(
        upsertAdminContent(
          actor,
          { kind: 'banner', key, title: 'Malo', ctaHref: 'javascript:alert(1)' },
          db,
        ),
        (error: unknown) => (error as { code?: string }).code === 'VALIDATION',
      )
      await assert.doesNotReject(
        upsertAdminContent(
          actor,
          { kind: 'banner', key, title: 'Bueno', ctaHref: 'https://example.com' },
          db,
        ),
      )
    })

    it('`support` no gestiona contenido', async () => {
      const { actor } = await actorWithRole('support')
      await assert.rejects(
        upsertAdminContent(actor, { kind: 'banner', key: `no-${token()}`, title: 'No' }, db),
        (error: unknown) => (error as { code?: string }).code === 'FORBIDDEN',
      )
    })
  })

  suite('usuarios y roles: nadie se queda sin administrar la tienda', () => {
    it('la regla del último super administrador es pura y explícita', () => {
      // Con dos o más activos, revocar procede.
      assert.doesNotThrow(() =>
        assertNotLastSuperAdmin({ roleKey: 'super_admin', remainingActive: 2, holdsRole: true }),
      )
      // Con uno solo, no.
      assert.throws(
        () =>
          assertNotLastSuperAdmin({ roleKey: 'super_admin', remainingActive: 1, holdsRole: true }),
        (error: unknown) => (error as { code?: string }).code === 'CONFLICT',
      )
      // Otros roles no están sujetos a la regla.
      assert.doesNotThrow(() =>
        assertNotLastSuperAdmin({ roleKey: 'editor', remainingActive: 1, holdsRole: true }),
      )
      // Si el usuario no tiene el rol, la revocación la rechaza otra comprobación.
      assert.doesNotThrow(() =>
        assertNotLastSuperAdmin({ roleKey: 'super_admin', remainingActive: 1, holdsRole: false }),
      )
    })

    it('solo `super_admin` gestiona usuarios', async () => {
      const { actor: admin } = await actorWithRole('admin')
      const { actor: superAdmin } = await actorWithRole('super_admin')
      await assert.rejects(
        listAdminUsers(admin, {}, db),
        (error: unknown) => (error as { code?: string }).code === 'FORBIDDEN',
      )
      const users = await listAdminUsers(superAdmin, { limit: 5 }, db)
      assert.ok(users.length > 0)
      assert.ok(users.every((user) => Array.isArray(user.roleKeys)))
    })

    it('concede y revoca un rol, dejando auditoría en ambos sentidos', async () => {
      const { actor } = await actorWithRole('super_admin')
      const { userId } = await actorWithRole('support')
      // Se filtra por email: la tabla tiene cientos de usuarios de otras
      // ejecuciones y el listado va paginado, así que buscar "a ciegas" es frágil.
      const [owner] = await client<{ email: string }[]>`
        SELECT email FROM users WHERE id = ${userId}`
      const email = owner!.email

      await assignAdminRole(actor, { userId, roleKey: 'editor' }, db)
      let users = await listAdminUsers(actor, { q: email }, db)
      let target = users.find((user) => user.userId === userId)
      assert.ok(target!.roleKeys.includes('editor'))

      await revokeAdminRole(actor, { userId, roleKey: 'editor' }, db)
      users = await listAdminUsers(actor, { q: email }, db)
      target = users.find((user) => user.userId === userId)
      assert.equal(target!.roleKeys.includes('editor'), false)

      const audit = createPostgresAuditRepository(db)
      const entries = await audit.listByEntity('user_roles', userId)
      assert.deepEqual(
        entries.map((entry) => entry.action).sort(),
        ['user.role_grant', 'user.role_revoke'],
      )
    })

    it('revocar un rol que no tiene se rechaza; y los roles listan con su número de permisos', async () => {
      const { actor } = await actorWithRole('super_admin')
      const { userId } = await actorWithRole('support')

      await assert.rejects(
        revokeAdminRole(actor, { userId, roleKey: 'manager' }, db),
        (error: unknown) => (error as { code?: string }).code === 'NOT_FOUND',
      )

      const roles = await listAdminRoles(actor, db)
      const superAdmin = roles.find((role) => role.key === 'super_admin')
      assert.ok(superAdmin)
      // La fuente de verdad es el catálogo: si se añade un permiso, este test lo exige.\n      assert.equal(superAdmin!.permissionCount, ALL_PERMISSIONS.length)
    })
  })
}
