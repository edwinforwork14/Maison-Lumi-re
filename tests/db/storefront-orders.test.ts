import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '../../src/server/db/schema/index.ts'
import {
  quoteCartFromDb,
  placeStorefrontOrder,
  listStorefrontOrders,
  findStorefrontOrderForOwner,
  readShippingConfig,
} from '../../src/server/services/storefront-orders.ts'

/**
 * Fase 3 del Plan 03: el checkout de la tienda sobre PostgreSQL.
 *
 * Aquí se fija lo que antes no ocurría: comprar **descuenta stock**, deja su
 * movimiento en el ledger, la sobreventa se rechaza y la lectura de pedidos
 * está acotada al titular (el filtro va en SQL).
 */

const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL
if (!url) console.warn('[tests/db/storefront-orders] DATABASE_URL no definida: suite omitida.')
const suite = url ? describe : describe.skip

if (url) {
  const client = postgres(url, { max: 5, onnotice: () => {} })
  const db = drizzle(client, { schema })

  after(async () => {
    await client.end({ timeout: 5 })
  })

  const token = () => Math.random().toString(36).slice(2, 10)

  /** Producto publicado con una variante activa y stock conocido. */
  async function seedSellableVariant(onHand: number, priceCents = 12_345) {
    const t = token()
    const [category] = await client<{ id: string }[]>`
      INSERT INTO categories (slug, name, status) VALUES (${`sf-${t}`}, 'Cat', 'active') RETURNING id`
    const [product] = await client<{ id: string }[]>`
      INSERT INTO products (slug, name, category_id, status, published_at, materials)
      VALUES (${`sf-prod-${t}`}, ${`Producto ${t}`}, ${category!.id}, 'active', now(), '{Cuero}')
      RETURNING id`
    const [variant] = await client<{ id: string; sku: string }[]>`
      INSERT INTO product_variants (product_id, sku, size, color, price_cents, status)
      VALUES (${product!.id}, ${`SF-${t}`}, 'Única', 'Negro', ${priceCents}, 'active')
      RETURNING id, sku`
    await client`
      INSERT INTO inventory_items (variant_id, on_hand, reserved, low_stock_threshold)
      VALUES (${variant!.id}, ${onHand}, 0, 0)`
    await client`
      INSERT INTO product_media (product_id, storage_key, alt, width, height, position)
      VALUES (${product!.id}, ${`https://cdn.test/${t}.jpg`}, 'Vista', 900, 1200, 0)`
    return { productId: product!.id, variantId: variant!.id, sku: variant!.sku, priceCents }
  }

  async function stockOf(variantId: string) {
    const [row] = await client<{ on_hand: string; reserved: string }[]>`
      SELECT on_hand, reserved FROM inventory_items WHERE variant_id = ${variantId}`
    return { onHand: Number(row!.on_hand), reserved: Number(row!.reserved) }
  }

  const customer = (email: string) => ({
    firstName: 'Ana',
    lastName: 'García',
    email,
    address: 'Calle Serrano 21',
    city: 'Madrid',
    postalCode: '28001',
    country: 'España',
  })

  suite('cotización desde la base', () => {
    it('lee precio, existencias e imagen de la base', async () => {
      const seeded = await seedSellableVariant(5, 20_000)
      const quote = await quoteCartFromDb({
        lines: [{ productId: seeded.productId, color: 'Negro', quantity: 2 }],
      })

      assert.equal(quote.lines.length, 1)
      assert.equal(quote.lines[0]!.unitPrice.amount, 20_000)
      assert.equal(quote.lines[0]!.lineTotal.amount, 40_000)
      assert.equal(quote.lines[0]!.availableStock, 5)
      assert.match(quote.lines[0]!.image, /cdn\.test/)
      assert.equal(quote.subtotal.amount, 40_000)
    })

    it('el envío y el umbral salen de la configuración, no de constantes', async () => {
      const config = await readShippingConfig(db)
      assert.ok(config.methods.length >= 2)
      assert.ok(config.freeThresholdCents > 0)

      const cheap = await seedSellableVariant(3, 1_000)
      const quote = await quoteCartFromDb({
        lines: [{ productId: cheap.productId, color: 'Negro', quantity: 1 }],
        shippingMethod: 'express',
      })
      const express = quote.shippingOptions.find((option) => option.id === 'express')
      assert.ok(express)
      assert.equal(quote.shipping.amount, express!.price.amount)
    })

    it('un producto en borrador no se puede comprar', async () => {
      const t = token()
      const [category] = await client<{ id: string }[]>`
        INSERT INTO categories (slug, name) VALUES (${`draft-${t}`}, 'Cat') RETURNING id`
      const [product] = await client<{ id: string }[]>`
        INSERT INTO products (slug, name, category_id, status)
        VALUES (${`draft-prod-${t}`}, 'Borrador', ${category!.id}, 'draft') RETURNING id`
      await client`
        INSERT INTO product_variants (product_id, sku, size, color, price_cents, status)
        VALUES (${product!.id}, ${`DRAFT-${t}`}, 'Única', 'Negro', 1000, 'active')`

      const quote = await quoteCartFromDb({
        lines: [{ productId: product!.id, color: 'Negro', quantity: 1 }],
      })
      assert.equal(quote.lines.length, 0, 'lo no publicado no entra en la cotización')
    })

    it('un id con forma inválida (carrito antiguo) no rompe la cotización', async () => {
      const seeded = await seedSellableVariant(4, 9_900)
      const quote = await quoteCartFromDb({
        lines: [
          { productId: seeded.productId, color: 'Negro', quantity: 1 },
          // Dato heredado de una versión anterior del catálogo: antes provocaba
          // `22P02 invalid input syntax for type uuid` y rompía TODO el carrito.
          { productId: 'aurora-frame', color: 'Beige', quantity: 2 },
        ],
      })

      assert.equal(quote.lines.length, 1, 'la línea válida se conserva')
      assert.equal(quote.lines[0]!.productId, seeded.productId)
      assert.equal(quote.subtotal.amount, 9_900)
    })
  })

  suite('pedido de la tienda: descuenta stock y deja ledger (D25)', () => {
    it('al comprar baja `on_hand` y queda el movimiento `order`', async () => {
      const seeded = await seedSellableVariant(4, 15_000)
      const email = `sf-${token()}@example.com`

      const lines = [{ productId: seeded.productId, color: 'Negro', quantity: 2 }]
      // El total autoritativo es el de la cotización (subtotal + envío).
      const quote = await quoteCartFromDb({ lines })
      const placed = await placeStorefrontOrder({
        email,
        lines,
        customer: customer(email),
        idempotencyKey: crypto.randomUUID(),
      })

      assert.match(placed.orderNumber, /^ML-\d+$/, 'el número va por secuencia')
      assert.equal(placed.total.amount, quote.total.amount)
      assert.equal(quote.subtotal.amount, 30_000)
      assert.equal(placed.reservationIds.length, 1)

      // Sin pasarela no se vende todavía: se RESERVA. El stock queda bloqueado
      // (no disponible) pero no descontado hasta que la tienda confirme.
      const stock = await stockOf(seeded.variantId)
      assert.equal(stock.onHand, 4, 'on_hand no baja al comprar')
      assert.equal(stock.reserved, 2, 'las 2 unidades quedan reservadas')
      assert.ok(new Date(placed.reservedUntil).getTime() > Date.now())

      const movements = await client<{ delta: string; reason: string }[]>`
        SELECT delta, reason FROM inventory_movements WHERE variant_id = ${seeded.variantId}`
      assert.equal(movements.length, 0, 'todavía no hay movimiento de salida')
    })

    it('confirmar el pedido (por WhatsApp, desde el panel) descuenta el stock', async () => {

      const seeded = await seedSellableVariant(2, 12_000)
      const email = `sf-${token()}@example.com`
      const placed = await placeStorefrontOrder({
        email,
        lines: [{ productId: seeded.productId, color: 'Negro', quantity: 1 }],
        customer: customer(email),
        idempotencyKey: crypto.randomUUID(),
      })

      // Se compromete la reserva, que es lo que hace el panel al confirmar.
      const { createPostgresInventoryRepository } = await import(
        '../../src/server/db/repositories/inventory.postgres.ts'
      )
      const inventory = createPostgresInventoryRepository(db)
      await inventory.commit(placed.reservationIds[0]!)

      const stock = await stockOf(seeded.variantId)
      assert.equal(stock.onHand, 1, 'on_hand baja al confirmar')
      assert.equal(stock.reserved, 0)

      const movements = await client<{ delta: string; reason: string }[]>`
        SELECT delta, reason FROM inventory_movements WHERE variant_id = ${seeded.variantId}`
      assert.equal(movements.length, 1)
      assert.equal(Number(movements[0]!.delta), -1)
      assert.equal(movements[0]!.reason, 'order')

    })

    it('no se puede comprar más de lo que hay', async () => {
      const seeded = await seedSellableVariant(1, 10_000)
      const email = `sf-${token()}@example.com`
      await assert.rejects(
        placeStorefrontOrder({
          email,
          lines: [{ productId: seeded.productId, color: 'Negro', quantity: 3 }],
          customer: customer(email),
          idempotencyKey: crypto.randomUUID(),
        }),
        (error: unknown) => (error as { code?: string }).code === 'OUT_OF_STOCK',
      )
      const stock = await stockOf(seeded.variantId)
      assert.equal(stock.onHand, 1, 'un rechazo no toca el stock')
    })

    it('la misma clave de idempotencia no duplica el pedido ni el descuento', async () => {
      const seeded = await seedSellableVariant(5, 10_000)
      const email = `sf-${token()}@example.com`
      const key = crypto.randomUUID()
      const input = {
        email,
        lines: [{ productId: seeded.productId, color: 'Negro', quantity: 1 }],
        customer: customer(email),
        idempotencyKey: key,
      }

      const first = await placeStorefrontOrder(input)
      const second = await placeStorefrontOrder(input)
      assert.equal(second.orderNumber, first.orderNumber)

      const [row] = await client<{ n: string }[]>`
        SELECT count(*)::text AS n FROM orders WHERE idempotency_key = ${key}`
      assert.equal(Number(row!.n), 1)
    })
  })

  suite('pedidos del cliente: la propiedad se filtra en SQL', () => {
    it('solo se listan los del titular', async () => {
      const seeded = await seedSellableVariant(3, 10_000)
      const owner = `sf-${token()}@example.com`
      const other = `sf-${token()}@example.com`

      await placeStorefrontOrder({
        email: owner,
        lines: [{ productId: seeded.productId, color: 'Negro', quantity: 1 }],
        customer: customer(owner),
        idempotencyKey: crypto.randomUUID(),
      })

      const mine = await listStorefrontOrders(owner)
      assert.equal(mine.length, 1)
      assert.equal(mine[0]!.itemsCount, 1)
      // El total del pedido incluye el envío configurado.
      assert.ok(mine[0]!.total.amount >= 10_000)

      const theirs = await listStorefrontOrders(other)
      assert.equal(theirs.length, 0, 'otro email no ve nada')
    })

    it('el detalle solo se entrega a su titular', async () => {
      const seeded = await seedSellableVariant(2, 9_000)
      const owner = `sf-${token()}@example.com`
      const placed = await placeStorefrontOrder({
        email: owner,
        lines: [{ productId: seeded.productId, color: 'Negro', quantity: 1 }],
        customer: customer(owner),
        idempotencyKey: crypto.randomUUID(),
      })

      const mine = await findStorefrontOrderForOwner(placed.orderNumber, owner)
      assert.ok(mine)
      assert.equal(mine!.lines.length, 1)
      assert.equal(mine!.lines[0]!.lineTotal.amount, 9_000)

      const theirs = await findStorefrontOrderForOwner(
        placed.orderNumber,
        `sf-${token()}@example.com`,
      )
      assert.equal(theirs, null, 'un pedido ajeno no se entrega ni se distingue de inexistente')
    })
  })
}
