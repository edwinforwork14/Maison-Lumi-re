import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import postgres from 'postgres'
import {
  placeOrderTransactional,
  fingerprintCheckout,
  type PlaceOrderInput,
} from '../../src/server/db/repositories/orders.postgres.ts'
import { createPostgresInventoryRepository } from '../../src/server/db/repositories/inventory.postgres.ts'
import { InsufficientStockError } from '../../src/server/db/repositories/inventory.port.ts'

/**
 * Fase 5 del plan 01: ledger de inventario transaccional y **sin sobreventa**.
 *
 * Estas pruebas son las que justifican la base de datos: comprueban
 * concurrencia real (dos checkouts a la vez sobre la última unidad), el ledger
 * obligatorio y la idempotencia con huella del payload.
 */

const url = process.env.DATABASE_URL
if (!url) {
  console.warn('[tests/db/checkout] DATABASE_URL no definida: suite omitida. Usa `npm run test:db`.')
}
const suite = url ? describe : describe.skip

if (url) {
  const client = postgres(url, { max: 8, onnotice: () => {} })
  after(async () => {
    await client.end({ timeout: 5 })
  })

  const token = () => Math.random().toString(36).slice(2, 10)

  /** Producto con una variante y su fila de existencias. */
  async function seedVariant(onHand: number) {
    const t = token()
    const [category] = await client<{ id: string }[]>`
      INSERT INTO categories (slug, name) VALUES (${`cat-${t}`}, ${`Categoría ${t}`}) RETURNING id`
    const [product] = await client<{ id: string }[]>`
      INSERT INTO products (slug, name, category_id, status, published_at)
      VALUES (${`prod-${t}`}, ${`Producto ${t}`}, ${category!.id}, 'active', now()) RETURNING id`
    const [variant] = await client<{ id: string }[]>`
      INSERT INTO product_variants (product_id, sku, size, color, price_cents)
      VALUES (${product!.id}, ${`SKU-${t}`}, 'M', 'Negro', 28000) RETURNING id`
    await client`
      INSERT INTO inventory_items (variant_id, on_hand, reserved, low_stock_threshold)
      VALUES (${variant!.id}, ${onHand}, 0, 0)`
    return { variantId: variant!.id, sku: `SKU-${t}`, token: t }
  }

  function checkoutInput(
    variantId: string,
    sku: string,
    idempotencyKey: string,
  ): PlaceOrderInput {
    return {
      email: `cliente-${token()}@example.com`,
      lines: [{ variantId, sku, name: 'Producto', unitPriceCents: 28000, quantity: 1 }],
      totals: { subtotalCents: 28000, shippingCents: 0, totalCents: 28000 },
      idempotencyKey,
    }
  }

  async function stockOf(variantId: string) {
    const [row] = await client<{ on_hand: string; reserved: string }[]>`
      SELECT on_hand, reserved FROM inventory_items WHERE variant_id = ${variantId}`
    return { onHand: Number(row!.on_hand), reserved: Number(row!.reserved) }
  }

  suite('checkout: la última unidad no se vende dos veces (concurrencia real)', () => {
    it('dos checkouts simultáneos sobre stock 1: uno gana y el otro recibe OUT_OF_STOCK', async () => {
      const { variantId, sku } = await seedVariant(1)

      const results = await Promise.allSettled([
        placeOrderTransactional(checkoutInput(variantId, sku, crypto.randomUUID())),
        placeOrderTransactional(checkoutInput(variantId, sku, crypto.randomUUID())),
      ])

      const ok = results.filter((r) => r.status === 'fulfilled')
      const failed = results.filter((r) => r.status === 'rejected')
      assert.equal(ok.length, 1, 'exactamente un checkout debe ganar')
      assert.equal(failed.length, 1, 'exactamente un checkout debe fallar')

      const reason = (failed[0] as PromiseRejectedResult).reason as Error & { code?: string }
      assert.equal(reason.code, 'OUT_OF_STOCK', reason.message)

      const stock = await stockOf(variantId)
      assert.equal(stock.onHand, 1, 'la reserva no descuenta on_hand')
      assert.equal(stock.reserved, 1, 'solo se reservó una unidad')
    })

    it('reservar dos veces seguidas la misma unidad falla tipado', async () => {
      const { variantId } = await seedVariant(1)
      const inventory = createPostgresInventoryRepository()
      const orderId = crypto.randomUUID()
      // El pedido debe existir para respetar la FK; se crea uno mínimo.
      await client`
        INSERT INTO orders (id, number, email, subtotal_cents, total_cents)
        VALUES (${orderId}, ${`ML-${token()}`}, 'fk@example.com', 28000, 28000)`

      await inventory.reserveForOrder(orderId, [{ variantId, quantity: 1 }], 900)
      await assert.rejects(
        inventory.reserveForOrder(orderId, [{ variantId, quantity: 1 }], 900),
        (error: unknown) => error instanceof InsufficientStockError,
      )
    })
  })

  suite('checkout: ledger obligatorio y compromiso de stock', () => {
    it('al comprometer la reserva baja on_hand y deja movimiento `order`', async () => {
      const { variantId, sku } = await seedVariant(3)
      const placed = await placeOrderTransactional(
        checkoutInput(variantId, sku, crypto.randomUUID()),
      )

      const inventory = createPostgresInventoryRepository()
      await inventory.commit(placed.reservationIds[0]!)

      const stock = await stockOf(variantId)
      assert.equal(stock.onHand, 2, 'on_hand baja al comprometer')
      assert.equal(stock.reserved, 0, 'la reserva se libera al comprometer')

      const movements = await client<{ delta: string; reason: string }[]>`
        SELECT delta, reason FROM inventory_movements WHERE variant_id = ${variantId}`
      assert.equal(movements.length, 1)
      assert.equal(Number(movements[0]!.delta), -1)
      assert.equal(movements[0]!.reason, 'order')
    })

    it('un ajuste manual cambia el stock y siempre deja movimiento', async () => {
      const { variantId } = await seedVariant(2)
      const inventory = createPostgresInventoryRepository()

      const after = await inventory.adjust({
        variantId,
        delta: 5,
        reason: 'purchase',
      })
      assert.equal(after.onHand, 7)

      await assert.rejects(
        inventory.adjust({ variantId, delta: -100, reason: 'correction' }),
        /stock negativo|CONFLICT|dejaría/i,
      )

      await assert.rejects(
        inventory.adjust({ variantId, delta: 1, reason: 'adjustment' }),
        /motivo/i,
        'un ajuste sin motivo no se permite',
      )
    })
  })

  suite('checkout: idempotencia con huella del payload', () => {
    it('la misma clave con el mismo contenido devuelve el pedido original', async () => {
      const { variantId, sku } = await seedVariant(5)
      const key = crypto.randomUUID()
      const input = checkoutInput(variantId, sku, key)

      const first = await placeOrderTransactional(input)
      const second = await placeOrderTransactional(input)

      assert.equal(second.orderId, first.orderId)
      assert.equal(second.number, first.number)
      assert.equal(second.replayed, true)
      assert.equal(first.replayed, false)

      const [row] = await client<{ n: string }[]>`
        SELECT count(*)::text AS n FROM orders WHERE idempotency_key = ${key}`
      assert.equal(Number(row!.n), 1, 'no se duplica el pedido')
    })

    it('la misma clave con contenido distinto falla con CONFLICT', async () => {
      const { variantId, sku } = await seedVariant(5)
      const key = crypto.randomUUID()
      const input = checkoutInput(variantId, sku, key)
      await placeOrderTransactional(input)

      const changed: PlaceOrderInput = {
        ...input,
        lines: [{ ...input.lines[0]!, quantity: 2 }],
        totals: { subtotalCents: 56000, shippingCents: 0, totalCents: 56000 },
      }
      assert.notEqual(fingerprintCheckout(changed), fingerprintCheckout(input))

      await assert.rejects(placeOrderTransactional(changed), (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'CONFLICT')
        return true
      })
    })
  })
}
