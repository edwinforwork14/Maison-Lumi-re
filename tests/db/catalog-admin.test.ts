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
  createAdminProduct,
  getAdminProduct,
  listAdminCategories,
  setAdminProductStatus,
  upsertAdminCategory,
  upsertAdminVariant,
  deleteAdminVariant,
  adjustAdminInventory,
} from '../../src/server/services/admin/catalog-admin.ts'
import { createPostgresAuditRepository } from '../../src/server/db/repositories/audit.postgres.ts'
import type { RoleKey } from '../../src/server/services/admin/permissions.ts'

/**
 * Plan 02, G2 completo: variantes y categorías con CRUD auditado.
 *
 * Lo que se comprueba aquí es lo que rompe un catálogo real: SKU duplicado,
 * variante borrada que ya está en pedidos, stock que impide borrar, ciclos en el
 * árbol de categorías y slug repetido en el mismo nivel.
 */

const url = process.env.DATABASE_URL
if (!url) console.warn('[tests/db/catalog-admin] DATABASE_URL no definida: suite omitida.')
const suite = url ? describe : describe.skip

if (url) {
  const client = postgres(url, { max: 5, onnotice: () => {} })
  const db = drizzle(client, { schema })
  const SECRET = 'secreto-de-pruebas-catalogo-con-mas-de-32-caracteres'

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
      VALUES (${`cat-${role}-${t}@example.com`}, ${hashPassword('Cat-Pass-1234')}) RETURNING id`
    await assignRoleToUser({ userId: user!.id, roleKey: role }, db)
    const sessions = createPostgresSessionsRepository(db, SECRET)
    const issued = await sessions.issue({ userId: user!.id, kind: 'admin' })
    return { actor: await resolveAdminActor(issued.cookieValue, db, SECRET), userId: user!.id }
  }

  async function productOf(actor: Awaited<ReturnType<typeof resolveAdminActor>>) {
    const t = token()
    const [category] = await client<{ id: string }[]>`
      INSERT INTO categories (slug, name) VALUES (${`c-${t}`}, 'Cat') RETURNING id`
    const created = await createAdminProduct(
      actor,
      { slug: `variantes-${t}`, name: `Producto ${t}`, categoryId: category!.id },
      db,
    )
    return created.id
  }

  suite('G2 · variantes: crear, editar, borrar con protección de histórico', () => {
    it('crea la variante con su fila de existencias para que sea vendible', async () => {
      const { actor } = await actorWithRole('editor')
      const productId = await productOf(actor)

      const created = await upsertAdminVariant(
        actor,
        { productId, sku: `SKU-${token()}`, size: 'M', color: 'Negro', priceCents: 28_000 },
        db,
      )
      assert.equal(created.created, true)

      const detail = await getAdminProduct(actor, productId, db)
      assert.equal(detail.variants.length, 1)
      assert.equal(detail.variants[0]!.priceCents, 28_000)
      assert.equal(detail.variants[0]!.onHand, 0, 'nace con existencias a cero, no sin fila')

      const [stockRow] = await client<{ n: string }[]>`
        SELECT count(*)::text AS n FROM inventory_items WHERE variant_id = ${created.id}`
      assert.equal(Number(stockRow!.n), 1)
    })

    it('rechaza SKU duplicado con CONFLICT', async () => {
      const { actor } = await actorWithRole('editor')
      const productId = await productOf(actor)
      const sku = `SKU-${token()}`
      await upsertAdminVariant(
        actor,
        { productId, sku, size: 'M', color: 'Negro', priceCents: 10_000 },
        db,
      )
      await assert.rejects(
        upsertAdminVariant(
          actor,
          { productId, sku, size: 'L', color: 'Marfil', priceCents: 12_000 },
          db,
        ),
        (error: unknown) => {
          assert.equal((error as { code?: string }).code, 'CONFLICT')
          return true
        },
      )
    })

    it('rechaza un precio tachado menor que el actual', async () => {
      const { actor } = await actorWithRole('editor')
      const productId = await productOf(actor)
      await assert.rejects(
        upsertAdminVariant(
          actor,
          {
            productId,
            sku: `SKU-${token()}`,
            size: 'M',
            color: 'Negro',
            priceCents: 20_000,
            compareAtPriceCents: 15_000,
          },
          db,
        ),
        (error: unknown) => (error as { code?: string }).code === 'VALIDATION',
      )
    })

    it('editar una variante deja before/after en la auditoría', async () => {
      const { actor } = await actorWithRole('editor')
      const productId = await productOf(actor)
      const created = await upsertAdminVariant(
        actor,
        { productId, sku: `SKU-${token()}`, size: 'M', color: 'Negro', priceCents: 10_000 },
        db,
      )
      await upsertAdminVariant(
        actor,
        {
          id: created.id,
          productId,
          sku: `SKU-${token()}`,
          size: 'M',
          color: 'Negro',
          priceCents: 12_500,
          status: 'active',
        },
        db,
      )

      const audit = createPostgresAuditRepository(db)
      const entries = await audit.listByEntity('product_variants', created.id)
      assert.equal(entries.length, 2)
      assert.deepEqual(
        entries.map((entry) => entry.action).sort(),
        ['variant.create', 'variant.update'],
      )
    })

    it('no borra una variante con stock: primero hay que ajustarlo a cero', async () => {
      const { actor } = await actorWithRole('super_admin')
      const productId = await productOf(actor)
      const created = await upsertAdminVariant(
        actor,
        { productId, sku: `SKU-${token()}`, size: 'M', color: 'Negro', priceCents: 9_000 },
        db,
      )
      await adjustAdminInventory(
        actor,
        { variantId: created.id, delta: 3, reason: 'purchase', note: 'Reposición' },
        db,
      )

      await assert.rejects(
        deleteAdminVariant(actor, created.id, db),
        (error: unknown) => {
          assert.equal((error as { code?: string }).code, 'CONFLICT')
          assert.match((error as { message?: string }).message ?? '', /stock/i)
          return true
        },
      )

      // Con el stock a cero, el borrado archiva en lugar de destruir: el ledger
      // es append-only y la variante ya tiene historia.
      await adjustAdminInventory(
        actor,
        { variantId: created.id, delta: -3, reason: 'correction', note: 'Retirada' },
        db,
      )
      const archived = await deleteAdminVariant(actor, created.id, db)
      assert.deepEqual(archived, { deleted: false, archived: true })

      const [row] = await client<{ status: string }[]>`
        SELECT status FROM product_variants WHERE id = ${created.id}`
      assert.equal(row!.status, 'archived')

      // Una variante sin historia comercial sí se borra de verdad.
      const fresh = await upsertAdminVariant(
        actor,
        { productId, sku: `SKU-${token()}`, size: 'Única', color: 'Marfil', priceCents: 4_000 },
        db,
      )
      const deleted = await deleteAdminVariant(actor, fresh.id, db)
      assert.deepEqual(deleted, { deleted: true, archived: false })
    })

    it('no borra una variante que aparece en pedidos', async () => {
      const { actor } = await actorWithRole('super_admin')
      const productId = await productOf(actor)
      const created = await upsertAdminVariant(
        actor,
        { productId, sku: `SKU-${token()}`, size: 'M', color: 'Negro', priceCents: 9_000 },
        db,
      )
      const t = token()
      const [order] = await client<{ id: string }[]>`
        INSERT INTO orders (number, email, subtotal_cents, total_cents)
        VALUES (${`ML-VAR-${t}`}, 'var@example.com', 9000, 9000) RETURNING id`
      await client`
        INSERT INTO order_items (order_id, variant_id, sku_snapshot, name_snapshot,
                                 unit_price_cents, quantity, line_total_cents)
        VALUES (${order!.id}, ${created.id}, 'SKU', 'Producto', 9000, 1, 9000)`

      await assert.rejects(
        deleteAdminVariant(actor, created.id, db),
        (error: unknown) => {
          assert.equal((error as { code?: string }).code, 'CONFLICT')
          assert.match((error as { message?: string }).message ?? '', /pedidos/i)
          return true
        },
      )
    })

    it('publicar exige variante: con una creada, ya se puede', async () => {
      const { actor } = await actorWithRole('editor')
      const productId = await productOf(actor)
      await assert.rejects(
        setAdminProductStatus(actor, { id: productId, status: 'active' }, db),
        /variantes/i,
      )
      await upsertAdminVariant(
        actor,
        { productId, sku: `SKU-${token()}`, size: 'Única', color: 'Negro', priceCents: 5_000 },
        db,
      )
      const published = await setAdminProductStatus(actor, { id: productId, status: 'active' }, db)
      assert.equal(published.status, 'active')
    })
  })

  suite('G2 · categorías: árbol sin ciclos ni slugs repetidos', () => {
    it('crea y lista categorías con su número de productos', async () => {
      const { actor } = await actorWithRole('editor')
      const t = token()
      const created = await upsertAdminCategory(
        actor,
        { slug: `cat-${t}`, name: `Categoría ${t}`, status: 'active' },
        db,
      )
      assert.equal(created.created, true)

      const rows = await listAdminCategories(actor, db)
      const row = rows.find((entry) => entry.id === created.id)
      assert.ok(row)
      assert.equal(row!.productCount, 0)
    })

    it('rechaza slug repetido en el mismo nivel', async () => {
      const { actor } = await actorWithRole('editor')
      const slug = `dup-${token()}`
      await upsertAdminCategory(actor, { slug, name: 'Una' }, db)
      await assert.rejects(
        upsertAdminCategory(actor, { slug, name: 'Otra' }, db),
        (error: unknown) => (error as { code?: string }).code === 'CONFLICT',
      )
    })

    it('rechaza una jerarquía con ciclo', async () => {
      const { actor } = await actorWithRole('editor')
      const t = token()
      const parent = await upsertAdminCategory(actor, { slug: `padre-${t}`, name: 'Padre' }, db)
      const child = await upsertAdminCategory(
        actor,
        { slug: `hijo-${t}`, name: 'Hijo', parentId: parent.id },
        db,
      )
      await assert.rejects(
        upsertAdminCategory(actor, { id: parent.id, slug: `padre-${t}`, name: 'Padre', parentId: child.id }, db),
        (error: unknown) => (error as { code?: string }).code === 'CONFLICT',
      )
      await assert.rejects(
        upsertAdminCategory(actor, { id: parent.id, slug: `padre-${t}`, name: 'Padre', parentId: parent.id }, db),
        (error: unknown) => (error as { code?: string }).code === 'VALIDATION',
      )
    })

    it('una categoría con padre se puede anidar y editar con auditoría', async () => {
      const { actor } = await actorWithRole('editor')
      const t = token()
      const parent = await upsertAdminCategory(actor, { slug: `raiz-${t}`, name: 'Raíz' }, db)
      const child = await upsertAdminCategory(
        actor,
        { slug: `sub-${t}`, name: 'Sub', parentId: parent.id, position: 2 },
        db,
      )
      await upsertAdminCategory(
        actor,
        { id: child.id, slug: `sub-${t}`, name: 'Sub renombrada', parentId: parent.id, status: 'active' },
        db,
      )
      const rows = await listAdminCategories(actor, db)
      const row = rows.find((entry) => entry.id === child.id)
      assert.equal(row!.name, 'Sub renombrada')
      assert.equal(row!.parentId, parent.id)

      const audit = createPostgresAuditRepository(db)
      const entries = await audit.listByEntity('categories', child.id)
      assert.equal(entries.length, 2)
    })

    it('`support` no gestiona el catálogo', async () => {
      const { actor } = await actorWithRole('support')
      await assert.rejects(
        upsertAdminCategory(actor, { slug: `no-${token()}`, name: 'No' }, db),
        (error: unknown) => (error as { code?: string }).code === 'FORBIDDEN',
      )
    })
  })
}
