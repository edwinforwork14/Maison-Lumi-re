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
  listAdminOrders,
  getAdminOrder,
  updateAdminOrderStatus,
  refundAdminOrder,
  listAdminCustomers,
  getAdminCustomer,
  maskEmail,
} from '../../src/server/services/admin/orders-admin.ts'
import { createPostgresAuditRepository } from '../../src/server/db/repositories/audit.postgres.ts'
import { PERMISSIONS, type RoleKey } from '../../src/server/services/admin/permissions.ts'

/**
 * Plan 02, G4: pedidos y clientes.
 *
 * Las transiciones las valida el DOMINIO (no la UI), el reembolso no puede
 * superar lo cobrado y la PII exige un permiso aparte que deja traza.
 */

const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL
if (!url) {
  console.warn('[tests/db/orders-admin] DATABASE_URL no definida: suite omitida.')
}
const suite = url ? describe : describe.skip

if (url) {
  const client = postgres(url, { max: 5, onnotice: () => {} })
  const db = drizzle(client, { schema })
  const SECRET = 'secreto-de-pruebas-pedidos-con-mas-de-32-caracteres'

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
      VALUES (${`ops-${role}-${t}@example.com`}, ${hashPassword('Ops-Pass-1234')}) RETURNING id`
    await assignRoleToUser({ userId: user!.id, roleKey: role }, db)
    const sessions = createPostgresSessionsRepository(db, SECRET)
    const issued = await sessions.issue({ userId: user!.id, kind: 'admin' })
    const actor = await resolveAdminActor(issued.cookieValue, db, SECRET)
    return { actor, userId: user!.id }
  }

  /** Pedido con una línea y, opcionalmente, un pago cobrado. */
  async function seedOrder(options: { status?: string; paid?: number; total?: number } = {}) {
    const t = token()
    const total = options.total ?? 20_000
    const [category] = await client<{ id: string }[]>`
      INSERT INTO categories (slug, name) VALUES (${`cat-${t}`}, 'Cat') RETURNING id`
    const [product] = await client<{ id: string }[]>`
      INSERT INTO products (slug, name, category_id) VALUES (${`p-${t}`}, 'Producto', ${category!.id}) RETURNING id`
    const [variant] = await client<{ id: string }[]>`
      INSERT INTO product_variants (product_id, sku, size, color, price_cents)
      VALUES (${product!.id}, ${`SKU-${t}`}, 'Única', 'Negro', ${total}) RETURNING id`
    const [order] = await client<{ id: string; number: string }[]>`
      INSERT INTO orders (number, email, status, subtotal_cents, total_cents, placed_at)
      VALUES (${`ML-OPS-${t}`}, ${`cliente-${t}@example.com`}, ${options.status ?? 'paid'},
              ${total}, ${total}, now())
      RETURNING id, number`
    await client`
      INSERT INTO order_items (order_id, variant_id, sku_snapshot, name_snapshot,
                               unit_price_cents, quantity, line_total_cents)
      VALUES (${order!.id}, ${variant!.id}, ${`SKU-${t}`}, 'Producto', ${total}, 1, ${total})`
    if (options.paid) {
      await client`
        INSERT INTO payments (order_id, provider, provider_reference, status, amount_cents, currency)
        VALUES (${order!.id}, 'fake', ${`ref-${t}`}, 'captured', ${options.paid}, 'EUR')`
    }
    return { orderId: order!.id, number: order!.number, email: `cliente-${t}@example.com` }
  }

  suite('G4 · pedidos: listar, detalle y transiciones del dominio', () => {
    it('lista pedidos y pagina por cursor', async () => {
      const { actor } = await actorWithRole('support')
      await seedOrder({ status: 'paid' })
      const page = await listAdminOrders(actor, { size: 5 }, db)
      assert.ok(page.items.length > 0)
      assert.ok(page.items.every((order) => typeof order.number === 'string'))
      assert.ok(page.items.every((order) => order.itemCount >= 0))
    })

    it('el detalle trae líneas, pagos, historial y las transiciones posibles', async () => {
      const { actor } = await actorWithRole('manager')
      const seeded = await seedOrder({ status: 'paid', paid: 20_000 })
      const detail = await getAdminOrder(actor, seeded.orderId, db)

      assert.equal(detail.order.number, seeded.number)
      assert.equal(detail.lines.length, 1)
      assert.equal(detail.lines[0]!.lineTotal.amount, 20_000)
      assert.equal(detail.payments.length, 1)
      // Desde `paid` el dominio solo permite `fulfilled` o `refunded`.
      assert.deepEqual([...detail.nextStatuses].sort(), ['fulfilled', 'refunded'])
    })

    it('una transición válida cambia el estado y deja historial y auditoría', async () => {
      const { actor, userId } = await actorWithRole('manager')
      const seeded = await seedOrder({ status: 'paid', paid: 20_000 })
      const since = new Date(Date.now() - 1_000)

      const result = await updateAdminOrderStatus(
        actor,
        { id: seeded.orderId, to: 'fulfilled', note: 'Enviado' },
        db,
      )
      assert.deepEqual(result, { from: 'paid', to: 'fulfilled' })

      const history = await client<{ from_status: string; to_status: string; actor_id: string }[]>`
        SELECT from_status, to_status, actor_id FROM order_status_history WHERE order_id = ${seeded.orderId}`
      assert.equal(history.length, 1)
      assert.equal(history[0]!.from_status, 'paid')
      assert.equal(history[0]!.to_status, 'fulfilled')
      assert.equal(history[0]!.actor_id, userId)

      const audit = createPostgresAuditRepository(db)
      const entries = await audit.listByEntity('orders', seeded.orderId)
      assert.ok(entries.some((entry) => entry.action === 'order.update_status'))
      assert.ok(since < new Date())
    })

    it('una transición imposible se rechaza (la valida el dominio)', async () => {
      const { actor } = await actorWithRole('manager')
      const seeded = await seedOrder({ status: 'fulfilled' })
      await assert.rejects(
        updateAdminOrderStatus(actor, { id: seeded.orderId, to: 'paid' }, db),
        (error: unknown) => {
          const e = error as { code?: string; message?: string }
          assert.equal(e.code, 'CONFLICT')
          assert.match(e.message ?? '', /no permitida/i)
          return true
        },
      )
    })

    it('support puede leer pero no cambiar estados', async () => {
      const { actor: support } = await actorWithRole('support')
      const seeded = await seedOrder({ status: 'paid' })
      await assert.doesNotReject(listAdminOrders(support, {}, db))
      await assert.rejects(
        updateAdminOrderStatus(support, { id: seeded.orderId, to: 'fulfilled' }, db),
        (error: unknown) => (error as { code?: string }).code === 'FORBIDDEN',
      )
    })
  })

  suite('G4 · reembolsos: nunca por encima de lo cobrado', () => {
    it('reembolsa parcialmente y lo deja auditado', async () => {
      const { actor } = await actorWithRole('super_admin')
      const seeded = await seedOrder({ status: 'paid', paid: 20_000 })
      const result = await refundAdminOrder(
        actor,
        { id: seeded.orderId, amountCents: 5_000, reason: 'Producto defectuoso' },
        db,
      )
      assert.equal(result.refundedCents, 5_000)

      const [payment] = await client<{ refunded_cents: string }[]>`
        SELECT refunded_cents FROM payments WHERE order_id = ${seeded.orderId}`
      assert.equal(Number(payment!.refunded_cents), 5_000)
    })

    it('el reembolso completo pasa el pedido a `refunded` con historial', async () => {
      const { actor } = await actorWithRole('super_admin')
      const seeded = await seedOrder({ status: 'paid', paid: 20_000 })
      const result = await refundAdminOrder(
        actor,
        { id: seeded.orderId, amountCents: 20_000, reason: 'Devolución completa' },
        db,
      )
      assert.equal(result.status, 'refunded')

      const [order] = await client<{ status: string }[]>`
        SELECT status FROM orders WHERE id = ${seeded.orderId}`
      assert.equal(order!.status, 'refunded')
    })

    it('reembolsar más de lo cobrado se rechaza con CONFLICT', async () => {
      const { actor } = await actorWithRole('super_admin')
      const seeded = await seedOrder({ status: 'paid', paid: 10_000 })
      await assert.rejects(
        refundAdminOrder(actor, { id: seeded.orderId, amountCents: 15_000, reason: 'De más' }, db),
        (error: unknown) => (error as { code?: string }).code === 'CONFLICT',
      )
    })

    it('sin pagos cobrados no hay nada que reembolsar', async () => {
      const { actor } = await actorWithRole('super_admin')
      const seeded = await seedOrder({ status: 'placed' })
      await assert.rejects(
        refundAdminOrder(actor, { id: seeded.orderId, amountCents: 1_000, reason: 'Sin pago' }, db),
        (error: unknown) => (error as { code?: string }).code === 'CONFLICT',
      )
    })

    it('manager no puede reembolsar (no tiene orders:refund)', async () => {
      const { actor } = await actorWithRole('manager')
      const seeded = await seedOrder({ status: 'paid', paid: 20_000 })
      await assert.rejects(
        refundAdminOrder(actor, { id: seeded.orderId, amountCents: 1_000, reason: 'Motivo' }, db),
        (error: unknown) => (error as { code?: string }).code === 'FORBIDDEN',
      )
    })
  })

  suite('G4 · clientes: la PII es un permiso aparte', () => {
    it('enmascara el email sin `customers:pii`', () => {
      assert.equal(maskEmail('ana.garcia@example.com'), 'a***@example.com')
      assert.equal(maskEmail('sin-arroba'), '***')
    })

    it('support ve métricas con el contacto enmascarado', async () => {
      const { actor } = await actorWithRole('support')
      const seeded = await seedOrder({ status: 'paid', paid: 20_000 })
      const t = token()
      const [user] = await client<{ id: string }[]>`
        INSERT INTO users (email, password_hash)
        VALUES (${seeded.email}, ${hashPassword('Cliente-Pass-1234')}) RETURNING id`
      await client`
        INSERT INTO customers (user_id, first_name, last_name, phone)
        VALUES (${user!.id}, 'Ana', ${`Apellido${t}`}, '+34600111222')`

      const page = await listAdminCustomers(actor, { q: seeded.email.split('@')[0]!, size: 5 }, db)
      assert.equal(page.items.length, 1)
      assert.equal(page.items[0]!.piiVisible, false)
      assert.match(page.items[0]!.email, /^[a-z]\*\*\*@/)
      assert.ok(page.items[0]!.orderCount >= 1)
      assert.ok(page.items[0]!.totalSpentCents >= 20_000)

      const detail = await getAdminCustomer(actor, page.items[0]!.id, db)
      assert.equal(detail.phone, null)
      assert.equal(detail.metrics.totalSpent.amount >= 20_000, true)
    })

    it('super_admin ve la PII y esa lectura queda auditada', async () => {
      const { actor } = await actorWithRole('super_admin')
      const seeded = await seedOrder({ status: 'paid', paid: 20_000 })
      const t = token()
      const [user] = await client<{ id: string }[]>`
        INSERT INTO users (email, password_hash)
        VALUES (${seeded.email}, ${hashPassword('Cliente-Pass-1234')}) RETURNING id`
      const [customer] = await client<{ id: string }[]>`
        INSERT INTO customers (user_id, first_name, last_name, phone)
        VALUES (${user!.id}, 'Ana', ${`Apellido${t}`}, '+34600111222') RETURNING id`

      const detail = await getAdminCustomer(actor, customer!.id, db)
      assert.equal(detail.email, seeded.email)
      assert.equal(detail.phone, '+34600111222')

      const audit = createPostgresAuditRepository(db)
      const entries = await audit.listByEntity('customers', customer!.id)
      assert.equal(entries.length, 1)
      assert.equal(entries[0]!.action, 'customer.read_pii')
    })

    it('sin `customers:read` no se listan clientes', async () => {
      const { actor } = await actorWithRole('editor')
      await assert.rejects(
        listAdminCustomers(actor, {}, db),
        (error: unknown) => (error as { code?: string }).code === 'FORBIDDEN',
      )
    })

    it('el permiso de PII es exactamente el que separa ambos comportamientos', () => {
      assert.equal(PERMISSIONS.customersRead, 'customers:read')
      assert.equal(PERMISSIONS.customersPii, 'customers:pii')
      assert.notEqual(PERMISSIONS.customersRead, PERMISSIONS.customersPii)
    })
  })
}
