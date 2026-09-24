import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '../../src/server/db/schema/index.ts'
import { hashPassword } from '../../src/server/runtime/password-hasher.ts'
import { seedRbac, assignRoleToUser } from '../../src/server/db/seed/rbac.ts'
import { createPostgresSessionsRepository } from '../../src/server/db/repositories/sessions.postgres.ts'
import { resolveAdminActor, assertPermission } from '../../src/server/services/admin/actor.ts'
import {
  listAdminProducts,
  createAdminProduct,
  updateAdminProduct,
  setAdminProductStatus,
  listAdminInventory,
  adjustAdminInventory,
  dashboardKpis,
  listAuditEntries,
  countAuditSince,
} from '../../src/server/services/admin/catalog-admin.ts'
import { PERMISSIONS, type RoleKey } from '../../src/server/services/admin/permissions.ts'

/**
 * Plan 02, G1–G3: el panel administrativo no es una UI con botones ocultos.
 * Aquí se comprueba que el permiso se exige en el servidor, que cada mutación
 * deja auditoría y que los KPIs salen de SQL real.
 */

const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL
if (!url) {
  console.warn('[tests/db/admin] DATABASE_URL no definida: suite omitida. Usa `npm run test:db`.')
}
const suite = url ? describe : describe.skip

if (url) {
  const client = postgres(url, { max: 5, onnotice: () => {} })
  const db = drizzle(client, { schema })
  const SECRET = 'secreto-de-pruebas-admin-con-mas-de-32-caracteres'

  after(async () => {
    await client.end({ timeout: 5 })
  })

  before(async () => {
    await seedRbac(db)
  })

  const token = () => Math.random().toString(36).slice(2, 10)

  async function actorWithRole(role: RoleKey): Promise<{ actor: Awaited<ReturnType<typeof resolveAdminActor>>; userId: string }> {
    const t = token()
    const [user] = await client<{ id: string }[]>`
      INSERT INTO users (email, password_hash)
      VALUES (${`admin-${role}-${t}@example.com`}, ${hashPassword('Admin-Pass-1234')})
      RETURNING id`
    await assignRoleToUser({ userId: user!.id, roleKey: role }, db)

    const sessions = createPostgresSessionsRepository(db, SECRET)
    const issued = await sessions.issue({ userId: user!.id, kind: 'admin' })
    const actor = await resolveAdminActor(issued.cookieValue, db, SECRET)
    return { actor, userId: user!.id }
  }

  /** Producto con una variante y su fila de existencias. */
  async function createVariant(productId: string, priceCents = 12_000, onHand = 5) {
    const t = token()
    const [variant] = await client<{ id: string }[]>`
      INSERT INTO product_variants (product_id, sku, size, color, price_cents)
      VALUES (${productId}, ${`SKU-${t}`}, 'Única', 'Negro', ${priceCents})
      RETURNING id`
    await client`
      INSERT INTO inventory_items (variant_id, on_hand, reserved, low_stock_threshold)
      VALUES (${variant!.id}, ${onHand}, 0, 2)`
    return variant!.id
  }

  async function categoryId(): Promise<string> {
    const t = token()
    const [row] = await client<{ id: string }[]>`
      INSERT INTO categories (slug, name) VALUES (${`cat-${t}`}, ${`Categoría ${t}`}) RETURNING id`
    return row!.id
  }

  suite('G1 · el permiso se exige en el servidor, no en la UI', () => {
    it('una sesión de tienda no abre el panel', async () => {
      const t = token()
      const [user] = await client<{ id: string }[]>`
        INSERT INTO users (email, password_hash)
        VALUES (${`shop-${t}@example.com`}, ${hashPassword('Tienda-Pass-1234')}) RETURNING id`
      const sessions = createPostgresSessionsRepository(db, SECRET)
      const issued = await sessions.issue({ userId: user!.id, kind: 'storefront' })
      assert.equal(await resolveAdminActor(issued.cookieValue, db), null)
    })

    it('sin cookie no hay actor y `assertPermission` lanza UNAUTHENTICATED', async () => {
      assert.equal(await resolveAdminActor(null, db), null)
      assert.throws(
        () => assertPermission(null, PERMISSIONS.productsRead),
        (error: unknown) => (error as { code?: string }).code === 'UNAUTHENTICATED',
      )
    })

    it('`support` no puede leer el catálogo (FORBIDDEN); `editor` sí', async () => {
      const { actor: support } = await actorWithRole('support')
      const { actor: editor } = await actorWithRole('editor')

      await assert.rejects(listAdminProducts(support, {}, db), (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'FORBIDDEN')
        return true
      })
      await assert.doesNotReject(listAdminProducts(editor, { size: 1 }, db))
    })

    it('`editor` no puede ajustar inventario ni leer auditoría', async () => {
      const { actor: editor } = await actorWithRole('editor')
      await assert.rejects(
        adjustAdminInventory(editor, { variantId: crypto.randomUUID(), delta: 1, reason: 'purchase' }, db),
        (error: unknown) => (error as { code?: string }).code === 'FORBIDDEN',
      )
      await assert.rejects(
        listAuditEntries(editor, {}, db),
        (error: unknown) => (error as { code?: string }).code === 'FORBIDDEN',
      )
    })

    it('`admin` no lee auditoría; `super_admin` sí', async () => {
      const { actor: admin } = await actorWithRole('admin')
      const { actor: superAdmin } = await actorWithRole('super_admin')
      await assert.rejects(
        listAuditEntries(admin, {}, db),
        (error: unknown) => (error as { code?: string }).code === 'FORBIDDEN',
      )
      await assert.doesNotReject(listAuditEntries(superAdmin, { limit: 1 }, db))
    })
  })

  suite('G2 · catálogo con CRUD auditado', () => {
    it('crear, listar, editar y publicar un producto, con auditoría en cada paso', async () => {
      const { actor } = await actorWithRole('editor')
      const t = token()
      const since = new Date(Date.now() - 1_000)

      const created = await createAdminProduct(
        actor,
        { slug: `nuevo-${t}`, name: `Producto ${t}`, categoryId: await categoryId() },
        db,
      )

      // Publicar sin variantes es imposible: no habría nada que vender.
      await assert.rejects(
        setAdminProductStatus(actor, { id: created.id, status: 'active' }, db),
        (error: unknown) => (error as { code?: string }).code === 'CONFLICT',
      )

      await createVariant(created.id, 15_000, 4)
      const published = await setAdminProductStatus(actor, { id: created.id, status: 'active' }, db)
      assert.equal(published.status, 'active')
      assert.ok(published.publishedAt instanceof Date)

      const updated = await updateAdminProduct(
        actor,
        { id: created.id, name: `Producto ${t} v2`, featured: true },
        db,
      )
      assert.deepEqual(updated.changed.sort(), ['featured', 'name'])

      const page = await listAdminProducts(actor, { q: `nuevo-${t}`, size: 5 }, db)
      assert.equal(page.items.length, 1)
      assert.equal(page.items[0]!.name, `Producto ${t} v2`)
      assert.equal(page.items[0]!.status, 'active')
      assert.equal(page.items[0]!.variantCount, 1)
      assert.equal(page.items[0]!.minPriceCents, 15_000)
      assert.equal(page.items[0]!.totalStock, 4)

      // Cuatro mutaciones/lecturas auditadas: create, publish y update.
      assert.ok((await countAuditSince(since, 'products', db)) >= 3)
    })

    it('rechaza un slug duplicado con CONFLICT', async () => {
      const { actor } = await actorWithRole('editor')
      const t = token()
      const slug = `dup-${t}`
      const category = await categoryId()
      await createAdminProduct(actor, { slug, name: 'Uno', categoryId: category }, db)
      await assert.rejects(
        createAdminProduct(actor, { slug, name: 'Dos', categoryId: category }, db),
        (error: unknown) => (error as { code?: string }).code === 'CONFLICT',
      )
    })

    it('el listado pagina por cursor de forma estable', async () => {
      const { actor } = await actorWithRole('super_admin')
      const first = await listAdminProducts(actor, { size: 2 }, db)
      assert.equal(first.items.length, 2)
      if (first.hasMore) {
        const second = await listAdminProducts(actor, { size: 2, cursor: first.nextCursor }, db)
        const firstIds = new Set(first.items.map((item) => item.id))
        assert.ok(second.items.every((item) => !firstIds.has(item.id)))
      }
    })
  })

  suite('G3 · inventario: ajuste motivado, movimiento y auditoría', () => {
    it('ajusta el stock, deja movimiento en el ledger y fila de auditoría', async () => {
      const { actor, userId } = await actorWithRole('super_admin')
      const { actor: editor } = await actorWithRole('editor')
      const category = await categoryId()
      const product = await createAdminProduct(
        editor,
        { slug: `inv-${token()}`, name: 'Producto inventario', categoryId: category },
        db,
      )
      const variantId = await createVariant(product.id, 9_000, 3)

      const after = await adjustAdminInventory(
        actor,
        { variantId, delta: 7, reason: 'purchase', note: 'Reposición' },
        db,
      )
      assert.equal(after.onHand, 10)
      assert.equal(after.available, 10)
      assert.equal(after.state, 'ok')

      const movements = await client<{ delta: string; reason: string; actor_id: string }[]>`
        SELECT delta, reason, actor_id FROM inventory_movements WHERE variant_id = ${variantId}`
      assert.equal(movements.length, 1)
      assert.equal(Number(movements[0]!.delta), 7)
      assert.equal(movements[0]!.reason, 'purchase')
      assert.equal(movements[0]!.actor_id, userId)

      const audit = await listAuditEntries(actor, { entity: 'inventory_items', entityId: variantId }, db)
      assert.equal(audit.length, 1)
      assert.equal(audit[0]!.action, 'inventory.adjust')
    })

    it('un ajuste que dejaría stock negativo se rechaza', async () => {
      const { actor } = await actorWithRole('super_admin')
      const { actor: editor } = await actorWithRole('editor')
      const product = await createAdminProduct(
        editor,
        { slug: `neg-${token()}`, name: 'Producto negativo', categoryId: await categoryId() },
        db,
      )
      const variantId = await createVariant(product.id, 5_000, 2)

      await assert.rejects(
        adjustAdminInventory(actor, { variantId, delta: -5, reason: 'correction' }, db),
        (error: unknown) => (error as { code?: string }).code === 'CONFLICT',
      )
    })

    it('exige motivo cuando el ajuste es manual', async () => {
      const { actor } = await actorWithRole('super_admin')
      const { actor: editor } = await actorWithRole('editor')
      const product = await createAdminProduct(
        editor,
        { slug: `mot-${token()}`, name: 'Producto motivo', categoryId: await categoryId() },
        db,
      )
      const variantId = await createVariant(product.id, 5_000, 2)

      await assert.rejects(
        adjustAdminInventory(actor, { variantId, delta: 1, reason: 'adjustment' }, db),
        /motivo/i,
      )
    })

    it('el listado de inventario marca agotado y stock bajo', async () => {
      const { actor } = await actorWithRole('manager')
      const page = await listAdminInventory(actor, { size: 50 }, db)
      assert.ok(page.items.length > 0)
      assert.ok(page.items.every((item) => item.available === item.onHand - item.reserved))
      assert.ok(page.items.every((item) => ['ok', 'low', 'out'].includes(item.state)))

      const out = await listAdminInventory(actor, { filter: 'out' }, db)
      assert.ok(out.items.every((item) => item.onHand === 0))
    })
  })

  suite('G5 · KPIs desde SQL real', () => {
    it('calcula ventas, pedidos, ticket medio, top productos y alertas', async () => {
      const { actor } = await actorWithRole('super_admin')
      const { actor: editor } = await actorWithRole('editor')
      const product = await createAdminProduct(
        editor,
        { slug: `kpi-${token()}`, name: 'Producto KPI', categoryId: await categoryId() },
        db,
      )
      const variantId = await createVariant(product.id, 20_000, 1)

      const from = new Date(Date.now() - 60 * 60 * 1_000)
      const to = new Date(Date.now() + 60 * 60 * 1_000)
      const before = await dashboardKpis(actor, { from, to }, db)

      // Dos pedidos contabilizables dentro de la ventana.
      const t = token()
      for (const total of [20_000, 40_000]) {
        const [order] = await client<{ id: string }[]>`
          INSERT INTO orders (number, email, status, subtotal_cents, total_cents, placed_at)
          VALUES (${`ML-KPI-${t}-${total}`}, 'kpi@example.com', 'paid', ${total}, ${total}, now())
          RETURNING id`
        await client`
          INSERT INTO order_items (order_id, variant_id, sku_snapshot, name_snapshot,
                                   unit_price_cents, quantity, line_total_cents)
          VALUES (${order!.id}, ${variantId}, 'SKU-KPI', 'Producto KPI', 20000, ${total / 20_000}, ${total})`
      }

      const after = await dashboardKpis(actor, { from, to }, db)
      assert.equal(after.orderCount, before.orderCount + 2)
      assert.equal(after.sales.amount, before.sales.amount + 60_000)
      assert.ok(Number.isInteger(after.averageOrderValue.amount))
      // Los más vendidos son globales (otros tests crean pedidos), así que se
      // comprueba la forma y el orden, no la pertenencia de una variante concreta.
      assert.ok(after.topProducts.length <= 5)
      assert.ok(after.topProducts.every((row) => row.unitsSold > 0))
      assert.ok(after.recentOrders.length > 0)
      assert.ok(after.stockAlerts.low >= 0 && after.stockAlerts.out >= 0)
    })

    it('rechaza un rango de fechas inválido', async () => {
      const { actor } = await actorWithRole('super_admin')
      const now = new Date()
      await assert.rejects(
        dashboardKpis(actor, { from: now, to: new Date(now.getTime() - 1_000) }, db),
        (error: unknown) => (error as { code?: string }).code === 'VALIDATION',
      )
    })

    it('`support` no puede ver los KPIs (no tiene reports:read)', async () => {
      const { actor: support } = await actorWithRole('support')
      const now = new Date()
      await assert.rejects(
        dashboardKpis(support, { from: new Date(now.getTime() - 1_000), to: now }, db),
        (error: unknown) => (error as { code?: string }).code === 'FORBIDDEN',
      )
    })
  })
}
