import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '../../src/server/db/schema/index.ts'
import { hashPassword } from '../../src/server/runtime/password-hasher.ts'
import { seedRbac, assignRoleToUser } from '../../src/server/db/seed/rbac.ts'
import { createPostgresSessionsRepository } from '../../src/server/db/repositories/sessions.postgres.ts'
import { resolveAdminActor } from '../../src/server/services/admin/actor.ts'
import { upsertAdminContent } from '../../src/server/services/admin/content-admin.ts'
import { getHomepageContent } from '../../src/server/services/storefront-content.ts'

/**
 * Plan 03 S4 + DoR 5 del Plan 02: la portada pública refleja lo que el panel
 * publica (mutación → consulta pública), oculta borradores y respeta la
 * vigencia temporal de los banners.
 */

const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL
if (!url) console.warn('[tests/db/homepage-content] DATABASE_URL no definida: suite omitida.')
const suite = url ? describe : describe.skip

if (url) {
  const client = postgres(url, { max: 5, onnotice: () => {} })
  const db = drizzle(client, { schema })
  const SECRET = 'secreto-de-pruebas-portada-con-mas-de-32-caracteres'

  after(async () => {
    await client.end({ timeout: 5 })
  })
  before(async () => {
    await seedRbac(db)
  })

  const token = () => Math.random().toString(36).slice(2, 10)

  async function superAdminActor() {
    const t = token()
    const [user] = await client<{ id: string }[]>`
      INSERT INTO users (email, password_hash)
      VALUES (${`home-${t}@example.com`}, ${hashPassword('Home-Pass-1234')}) RETURNING id`
    await assignRoleToUser({ userId: user!.id, roleKey: 'super_admin' }, db)
    const sessions = createPostgresSessionsRepository(db, SECRET)
    const issued = await sessions.issue({ userId: user!.id, kind: 'admin' })
    return resolveAdminActor(issued.cookieValue, db, SECRET)
  }

  suite('portada pública: mutación del panel → consulta de la tienda', () => {
    it('una sección publicada aparece en la portada con sus textos', async () => {
      const actor = await superAdminActor()
      const key = `home-pub-${token()}`
      await upsertAdminContent(
        actor,
        { kind: 'section', key, title: 'Titular de prueba', subtitle: 'Bajada', status: 'published' },
        db,
      )

      const { blocks } = await getHomepageContent(db)
      const block = blocks.find((b) => b.key === key)
      assert.ok(block, 'lo publicado en el panel debe verse en la portada')
      assert.equal(block?.title, 'Titular de prueba')
      assert.equal(block?.subtitle, 'Bajada')
    })

    it('un borrador no aparece y al archivarlo desaparece', async () => {
      const actor = await superAdminActor()
      const key = `home-draft-${token()}`

      await upsertAdminContent(actor, { kind: 'section', key, title: 'Borrador', status: 'draft' }, db)
      let { blocks } = await getHomepageContent(db)
      assert.equal(blocks.some((b) => b.key === key), false, 'un borrador no es público')

      await upsertAdminContent(
        actor,
        { kind: 'section', id: (await findId(key))!, key, title: 'Borrador', status: 'published' },
        db,
      )
      ;({ blocks } = await getHomepageContent(db))
      assert.ok(blocks.some((b) => b.key === key), 'al publicarse debe aparecer')

      await upsertAdminContent(
        actor,
        { kind: 'section', id: (await findId(key))!, key, title: 'Borrador', status: 'archived' },
        db,
      )
      ;({ blocks } = await getHomepageContent(db))
      assert.equal(blocks.some((b) => b.key === key), false, 'archivado deja de ser público')
    })

    it('un banner con la ventana vencida no se pinta', async () => {
      const key = `home-exp-${token()}`
      await client`
        INSERT INTO banners (key, title, placement, position, status, starts_at, ends_at)
        VALUES (${key}, 'Promo caducada', 'home_hero', 0, 'published',
                now() - interval '10 days', now() - interval '1 day')`

      const { blocks } = await getHomepageContent(db)
      assert.equal(blocks.some((b) => b.key === key), false, 'la ventana vencida excluye el banner')
    })

    it('un banner vigente sí se pinta', async () => {
      const key = `home-live-${token()}`
      await client`
        INSERT INTO banners (key, title, placement, position, status, starts_at, ends_at)
        VALUES (${key}, 'Promo vigente', 'home_hero', 0, 'published',
                now() - interval '1 day', now() + interval '1 day')`

      const { blocks } = await getHomepageContent(db)
      const block = blocks.find((b) => b.key === key)
      assert.ok(block, 'una ventana que incluye now debe publicarse')
      assert.equal(block?.title, 'Promo vigente')
    })

    async function findId(key: string): Promise<string | undefined> {
      const rows = await client<{ id: string }[]>`SELECT id FROM homepage_sections WHERE key = ${key}`
      return rows[0]?.id
    }
  })
}
