import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import postgres from 'postgres'

/**
 * Tests de integridad contra PostgreSQL real (plan 01, §5 y §11).
 *
 * Comprueban lo que ningún test unitario puede: que la BASE DE DATOS rechaza
 * los datos inválidos (checks, únicos funcionales, FKs) y que acepta un flujo
 * comercial coherente. Requieren `DATABASE_URL`; sin ella se omiten.
 *
 *   docker run -d --name ml-postgres -e POSTGRES_PASSWORD=... -p 5433:5432 postgres:16-alpine
 *   DATABASE_URL=postgres://ml:...@localhost:5433/maison_lumiere npm run test:db
 */

const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL
if (!url) {
  console.warn(
    '[tests/db] DATABASE_URL no definida: la suite de integridad se omite. Ejecútala con `npm run test:db`.',
  )
}

const suite = url ? describe : describe.skip

if (url) {
  const sql = postgres(url, { max: 3, onnotice: () => {} })
  after(async () => {
    await sql.end({ timeout: 5 })
  })

  const token = () => Math.random().toString(36).slice(2, 10)

  /** Categoría + producto + variante + inventario coherentes. */
  async function seedVariant(options: { onHand?: number } = {}) {
    const t = token()
    const [category] = await sql<{ id: string }[]>`
      INSERT INTO categories (slug, name) VALUES (${`cat-${t}`}, ${`Categoría ${t}`})
      RETURNING id`
    const [product] = await sql<{ id: string }[]>`
      INSERT INTO products (slug, name, category_id, status, published_at)
      VALUES (${`prod-${t}`}, ${`Producto ${t}`}, ${category!.id}, 'active', now())
      RETURNING id`
    const [variant] = await sql<{ id: string }[]>`
      INSERT INTO product_variants (product_id, sku, size, color, price_cents)
      VALUES (${product!.id}, ${`SKU-${t}`}, 'M', 'Negro', 28000)
      RETURNING id`
    await sql`
      INSERT INTO inventory_items (variant_id, on_hand, reserved, low_stock_threshold)
      VALUES (${variant!.id}, ${options.onHand ?? 10}, 0, 3)`
    return { productId: product!.id, variantId: variant!.id, token: t }
  }

  /** Afirma que la consulta es rechazada por la restricción indicada. */
  async function rejectsWith(query: Promise<unknown>, fragment: string) {
    await assert.rejects(query, (error: unknown) => {
      const e = error as { constraint_name?: string; message?: string }
      const haystack = `${e.constraint_name ?? ''} ${e.message ?? ''}`
      assert.ok(
        haystack.includes(fragment),
        `se esperaba la restricción "${fragment}" y llegó: ${haystack}`,
      )
      return true
    })
  }

  suite('BD: el dinero no admite valores imposibles', () => {
    it('rechaza un total de pedido descuadrado', async () => {
      const t = token()
      await rejectsWith(
        sql`INSERT INTO orders (number, email, subtotal_cents, shipping_cents, tax_cents, discount_cents, total_cents)
            VALUES (${`ML-${t}`}, ${`a-${t}@example.com`}, 28000, 1200, 0, 0, 99999)`,
        'orders_total_identity_check',
      )
    })

    it('rechaza importes negativos', async () => {
      const t = token()
      await rejectsWith(
        sql`INSERT INTO orders (number, email, subtotal_cents, total_cents)
            VALUES (${`ML-${t}`}, ${`b-${t}@example.com`}, -1, -1)`,
        'orders_subtotal_cents_check',
      )
    })

    it('rechaza un line_total que no cuadra con precio × cantidad', async () => {
      const { variantId, token: t } = await seedVariant()
      const [order] = await sql<{ id: string }[]>`
        INSERT INTO orders (number, email, subtotal_cents, total_cents)
        VALUES (${`ML-${t}`}, ${`c-${t}@example.com`}, 28000, 28000)
        RETURNING id`
      await rejectsWith(
        sql`INSERT INTO order_items (order_id, variant_id, sku_snapshot, name_snapshot, unit_price_cents, quantity, line_total_cents)
            VALUES (${order!.id}, ${variantId}, 'SKU-X', 'Producto', 28000, 2, 28000)`,
        'order_items_line_total_identity_check',
      )
    })

    it('acepta un pedido coherente con sus líneas', async () => {
      const { variantId, token: t } = await seedVariant()
      const [order] = await sql<{ id: string; total_cents: number }[]>`
        INSERT INTO orders (number, email, subtotal_cents, shipping_cents, total_cents)
        VALUES (${`ML-${t}`}, ${`ok-${t}@example.com`}, 56000, 0, 56000)
        RETURNING id, total_cents`
      await sql`INSERT INTO order_items (order_id, variant_id, sku_snapshot, name_snapshot, unit_price_cents, quantity, line_total_cents)
                VALUES (${order!.id}, ${variantId}, 'SKU-OK', 'Producto', 28000, 2, 56000)`
      // postgres.js devuelve bigint como string si no se mapea: se normaliza.\n      assert.equal(Number(order!.total_cents), 56000)
    })
  })

  suite('BD: inventario sin stock negativo ni sobreventa estructural', () => {
    it('rechaza reserved mayor que on_hand', async () => {
      const { variantId } = await seedVariant({ onHand: 3 })
      await rejectsWith(
        sql`UPDATE inventory_items SET reserved = 5 WHERE variant_id = ${variantId}`,
        'inventory_items_reserved_within_on_hand_check',
      )
    })

    it('rechaza on_hand negativo', async () => {
      const { variantId } = await seedVariant({ onHand: 3 })
      await rejectsWith(
        sql`UPDATE inventory_items SET on_hand = -1 WHERE variant_id = ${variantId}`,
        'inventory_items_on_hand_check',
      )
    })

    it('rechaza un movimiento de inventario con delta cero', async () => {
      const { variantId } = await seedVariant()
      await rejectsWith(
        sql`INSERT INTO inventory_movements (variant_id, delta, reason) VALUES (${variantId}, 0, 'purchase')`,
        'inventory_movements_delta_check',
      )
    })

    it('exige motivo cuando el movimiento es un ajuste', async () => {
      const { variantId } = await seedVariant()
      await rejectsWith(
        sql`INSERT INTO inventory_movements (variant_id, delta, reason) VALUES (${variantId}, 5, 'adjustment')`,
        'inventory_movements',
      )
    })

    it('acepta un movimiento con motivo', async () => {
      const { variantId } = await seedVariant()
      await sql`INSERT INTO inventory_movements (variant_id, delta, reason, note)
                VALUES (${variantId}, 5, 'adjustment', 'Reposición de almacén')`
      const [row] = await sql<{ delta: number }[]>`
        SELECT delta FROM inventory_movements WHERE variant_id = ${variantId} ORDER BY created_at DESC LIMIT 1`
      assert.equal(Number(row!.delta), 5)
    })
  })

  suite('BD: unicidad que el compilador no puede garantizar', () => {
    it('rechaza el mismo email con distinto caso', async () => {
      const t = token()
      await sql`INSERT INTO users (email, password_hash) VALUES (${`dup-${t}@example.com`}, 'hash')`
      await rejectsWith(
        sql`INSERT INTO users (email, password_hash) VALUES (${`DUP-${t}@EXAMPLE.COM`}, 'hash')`,
        'users_email_lower_key',
      )
    })

    it('rechaza SKU duplicado y slug duplicado', async () => {
      const { variantId: _ignored, token: t } = await seedVariant()
      await rejectsWith(
        sql`INSERT INTO product_variants (product_id, sku, size, color, price_cents)
            SELECT product_id, sku, 'L', 'Marfil', 1000 FROM product_variants WHERE sku = ${`SKU-${t}`}`,
        'product_variants_sku_key',
      )
      await rejectsWith(
        sql`INSERT INTO products (slug, name, category_id)
            SELECT slug, 'Otro', category_id FROM products WHERE slug = ${`prod-${t}`}`,
        'products_slug_key',
      )
    })

    it('rechaza dos categorías raíz con el mismo slug (NULLS NOT DISTINCT)', async () => {
      const t = token()
      await sql`INSERT INTO categories (slug, name) VALUES (${`raiz-${t}`}, 'Raíz')`
      await rejectsWith(
        sql`INSERT INTO categories (slug, name) VALUES (${`raiz-${t}`}, 'Raíz duplicada')`,
        'categories_parent_slug_key',
      )
    })

    it('no permite dos eventos de pago idénticos del proveedor (webhook repetido)', async () => {
      const t = token()
      await sql`INSERT INTO payment_events (provider, provider_event_id, type, payload)
                VALUES ('fake', ${`evt-${t}`}, 'payment.succeeded', '{}'::jsonb)`
      await rejectsWith(
        sql`INSERT INTO payment_events (provider, provider_event_id, type, payload)
            VALUES ('fake', ${`evt-${t}`}, 'payment.succeeded', '{}'::jsonb)`,
        'payment_events',
      )
    })
  })

  suite('BD: integridad referencial', () => {
    it('no deja borrar un producto que tiene variantes (RESTRICT)', async () => {
      const { productId } = await seedVariant()
      await rejectsWith(
        sql`DELETE FROM products WHERE id = ${productId}`,
        'violates foreign key constraint',
      )
    })

    it('no deja crear una variante sin producto existente', async () => {
      await rejectsWith(
        sql`INSERT INTO product_variants (product_id, sku, size, color, price_cents)
            VALUES (${crypto.randomUUID()}, ${`SKU-${token()}`}, 'M', 'Negro', 1000)`,
        'violates foreign key constraint',
      )
    })
  })
}
