import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '../../src/server/db/schema/index.ts'
import {
  couponDiscountCents,
  assertCouponUsable,
} from '../../src/server/services/promotions.ts'
import {
  placeStorefrontOrder,
  quoteCartFromDb,
} from '../../src/server/services/storefront-orders.ts'
import { placeOrderTransactional } from '../../src/server/db/repositories/orders.postgres.ts'

/**
 * Plan 03 §3 e invariante §5.10 del Plan 01:
 * el cupón se valida y se aplica **en el servidor**, el descuento cambia el
 * total, el canje se registra una sola vez por pedido y los límites se cuentan
 * en la transacción que crea el pedido.
 */

const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL
if (!url) console.warn('[tests/db/coupons-checkout] DATABASE_URL no definida: suite omitida.')
const suite = url ? describe : describe.skip

if (url) {
  const client = postgres(url, { max: 5, onnotice: () => {} })
  const db = drizzle(client, { schema })

  after(async () => {
    await client.end({ timeout: 5 })
  })

  const token = () => Math.random().toString(36).slice(2, 10)

  /** Producto con stock y precio conocidos. */
  async function seedProduct(priceCents = 20_000, stock = 10) {
    const t = token()
    const [category] = await client<{ id: string }[]>`
      INSERT INTO categories (slug, name) VALUES (${`cc-${t}`}, 'Cat') RETURNING id`
    const [product] = await client<{ id: string }[]>`
      INSERT INTO products (slug, name, category_id, status, published_at)
      VALUES (${`cc-${t}`}, 'Gafas', ${category!.id}, 'active', now()) RETURNING id`
    const [variant] = await client<{ id: string }[]>`
      INSERT INTO product_variants (product_id, sku, size, color, price_cents, status)
      VALUES (${product!.id}, ${`SKU-${t}`}, 'Única', 'Negro', ${priceCents}, 'active')
      RETURNING id`
    await client`
      INSERT INTO inventory_items (variant_id, on_hand, reserved)
      VALUES (${variant!.id}, ${stock}, 0)`
    return { productId: product!.id, variantId: variant!.id, priceCents }
  }

  async function createCoupon(input: {
    kind: 'percent' | 'fixed' | 'free_shipping'
    value: number
    minSubtotalCents?: number
    maxUses?: number
    maxUsesPerCustomer?: number
    status?: string
    endsAt?: Date
  }) {
    const code = `CPN${token().toUpperCase()}`
    const [row] = await client<{ id: string }[]>`
      INSERT INTO coupons (code, kind, value, min_subtotal_cents, max_uses,
                           max_uses_per_customer, status, starts_at, ends_at)
      VALUES (${code}, ${input.kind}, ${input.value}, ${input.minSubtotalCents ?? 0},
              ${input.maxUses ?? null}, ${input.maxUsesPerCustomer ?? null},
              ${input.status ?? 'active'}, now() - interval '1 day', ${input.endsAt ?? null})
      RETURNING id`
    return { id: row!.id, code }
  }

  function orderInput(lines: Array<{ productId: string; color?: string; quantity?: number }>, couponCode?: string) {
    const email = `cc-${token()}@example.com`
    return {
      email,
      lines: lines.map((line) => ({
        productId: line.productId,
        color: line.color ?? 'Negro',
        quantity: line.quantity ?? 1,
      })),
      couponCode,
      customer: {
        firstName: 'Ana',
        lastName: 'García',
        email,
        address: 'Calle Mayor 1',
        city: 'Madrid',
        postalCode: '28001',
        country: 'España',
      },
      idempotencyKey: `idem-${token()}${token()}`,
    }
  }

  suite('reglas puras del cupón', () => {
    it('el descuento depende del tipo y nunca supera el subtotal', () => {
      assert.equal(couponDiscountCents('percent', 10, 10_000), 1_000)
      assert.equal(couponDiscountCents('fixed', 500, 10_000), 500)
      // Nunca se descuenta más de lo que hay que pagar.
      assert.equal(couponDiscountCents('fixed', 99_999, 1_000), 1_000)
      // Envío gratuito: el efecto va por el envío, no por el subtotal.
      assert.equal(couponDiscountCents('free_shipping', 0, 10_000), 0)
      assert.equal(couponDiscountCents('percent', 10, 0), 0)
    })

    it('vigencia, mínimo y límites se rechazan con mensajes legibles', () => {
      const base = {
        id: 'x',
        code: 'PRUEBA',
        kind: 'percent' as const,
        value: 10,
        minSubtotalCents: 5_000,
        maxUses: 1,
        maxUsesPerCustomer: 1,
        startsAt: new Date('2026-01-01T00:00:00Z'),
        endsAt: new Date('2026-12-31T00:00:00Z'),
        status: 'active',
      }
      const usage = { totalRedemptions: 0, customerRedemptions: 0 }

      assert.doesNotThrow(() =>
        assertCouponUsable(base, { subtotalCents: 10_000, usage }),
      )
      assert.throws(
        () => assertCouponUsable(base, { subtotalCents: 1_000, usage }),
        /subtotal mínimo/,
      )
      assert.throws(
        () => assertCouponUsable(base, { subtotalCents: 10_000, usage: { totalRedemptions: 1, customerRedemptions: 0 } }),
        /límite de usos/,
      )
      assert.throws(
        () => assertCouponUsable(base, { subtotalCents: 10_000, usage: { totalRedemptions: 0, customerRedemptions: 1 } }),
        /máximo permitido/,
      )
      assert.throws(
        () => assertCouponUsable({ ...base, status: 'paused' }, { subtotalCents: 10_000, usage }),
        /no está activo/,
      )
      assert.throws(
        () =>
          assertCouponUsable(
            { ...base, endsAt: new Date('2026-02-01T00:00:00Z') },
            { subtotalCents: 10_000, usage, now: new Date('2026-06-01T00:00:00Z') },
          ),
        /ha caducado/,
      )
    })
  })

  suite('cotización con cupón', () => {
    it('el 10 % baja el total y el servidor devuelve el cupón aplicado', async () => {
      const { productId } = await seedProduct(20_000)
      const { code } = await createCoupon({ kind: 'percent', value: 10 })

      const plain = await quoteCartFromDb({ lines: [{ productId, color: 'Negro', quantity: 2 }] }, db)
      const withCoupon = await quoteCartFromDb(
        { lines: [{ productId, color: 'Negro', quantity: 2 }], couponCode: code },
        db,
      )

      assert.equal(plain.subtotal.amount, 40_000)
      assert.equal(plain.discount.amount, 0)
      assert.equal(withCoupon.discount.amount, 4_000)
      assert.equal(withCoupon.coupon?.code, code)
      assert.equal(
        withCoupon.total.amount,
        withCoupon.subtotal.amount - withCoupon.discount.amount + withCoupon.shipping.amount,
      )
      assert.equal(plain.total.amount - withCoupon.total.amount, 4_000)
    })

    it('envío gratuito: el cupón pone el envío a cero sin tocar el subtotal', async () => {
      const { productId } = await seedProduct(20_000)
      const { code } = await createCoupon({ kind: 'free_shipping', value: 0 })

      const quote = await quoteCartFromDb(
        {
          lines: [{ productId, color: 'Negro', quantity: 1 }],
          shippingMethod: 'standard',
          couponCode: code,
        },
        db,
      )
      assert.equal(quote.discount.amount, 0)
      assert.equal(quote.shipping.amount, 0)
      assert.ok(quote.shippingOptions.every((option) => option.free))
      assert.equal(quote.total.amount, quote.subtotal.amount)
    })

    it('código inexistente, caducado o bajo mínimo se rechaza en la cotización', async () => {
      const { productId } = await seedProduct(20_000)
      const missing = `NOPE${token().toUpperCase()}`
      await assert.rejects(
        quoteCartFromDb({ lines: [{ productId, color: 'Negro', quantity: 1 }], couponCode: missing }, db),
        (error: unknown) => (error as { code?: string }).code === 'VALIDATION',
      )

      const inactive = await createCoupon({ kind: 'percent', value: 10, status: 'paused' })
      await assert.rejects(
        quoteCartFromDb({ lines: [{ productId, color: 'Negro', quantity: 1 }], couponCode: inactive.code }, db),
        /no está activo/,
      )

      const strict = await createCoupon({ kind: 'percent', value: 10, minSubtotalCents: 900_000 })
      await assert.rejects(
        quoteCartFromDb({ lines: [{ productId, color: 'Negro', quantity: 1 }], couponCode: strict.code }, db),
        /subtotal mínimo/,
      )
    })
  })

  suite('checkout con cupón: canje único y límites en la transacción', () => {
    it('crea el pedido con descuento, guarda coupon_id y registra UN canje', async () => {
      const { productId } = await seedProduct(20_000)
      const { id: couponId, code } = await createCoupon({ kind: 'percent', value: 25 })

      const input = orderInput([{ productId }], code)
      const expected = await quoteCartFromDb(
        { lines: [{ productId, color: 'Negro', quantity: 1 }], couponCode: code },
        db,
      )
      const placed = await placeStorefrontOrder(input, db)
      assert.match(placed.orderNumber, /^ML-\d{6}$/)
      assert.equal(placed.total.amount, expected.total.amount)
      assert.equal(expected.discount.amount, 5_000)

      const [order] = await client<{
        coupon_id: string | null
        subtotal_cents: number
        discount_cents: number
        shipping_cents: number
        tax_cents: number
        total_cents: number
      }[]>`
        SELECT coupon_id, subtotal_cents::int AS subtotal_cents,
               discount_cents::int AS discount_cents,
               shipping_cents::int AS shipping_cents,
               tax_cents::int AS tax_cents,
               total_cents::int AS total_cents
        FROM orders WHERE number = ${placed.orderNumber}`
      assert.equal(order!.coupon_id, couponId)
      assert.equal(order!.discount_cents, 5_000)
      // CHECK de la base: total = subtotal - descuento + envío + impuestos.
      assert.equal(
        order!.total_cents,
        order!.subtotal_cents - order!.discount_cents + order!.shipping_cents + order!.tax_cents,
      )

      const [redemptions] = await client<{ n: number }[]>`
        SELECT count(*)::int AS n FROM coupon_redemptions cr
        JOIN orders o ON o.id = cr.order_id
        WHERE o.number = ${placed.orderNumber}`
      assert.equal(redemptions!.n, 1)
    })

    it('un cupón agotado se rechaza: tanto al cotizar como dentro de la transacción', async () => {
      const { productId } = await seedProduct(20_000)
      const { id: couponId, code } = await createCoupon({ kind: 'percent', value: 10, maxUses: 1 })

      // El primer pedido consume el único uso.
      await placeStorefrontOrder(orderInput([{ productId }], code), db)

      // A partir de ahí, la cotización ya no lo acepta (mensaje legible)…
      await assert.rejects(
        quoteCartFromDb(
          { lines: [{ productId, color: 'Negro', quantity: 1 }], couponCode: code },
          db,
        ),
        /límite de usos/,
      )

      // …y la transacción del pedido también lo comprueba por su cuenta: es la
      // garantía que vale cuando dos checkouts llegan a la vez.
      await assert.rejects(
        placeOrderTransactional(
          {
            email: `race-${token()}@example.com`,
            lines: [
              {
                variantId: (await seedProduct(20_000)).variantId,
                sku: 'SKU-RACE',
                name: 'Gafas',
                unitPriceCents: 20_000,
                quantity: 1,
              },
            ],
            totals: { subtotalCents: 20_000, discountCents: 0, shippingCents: 0, taxCents: 0, totalCents: 20_000 },
            coupon: { id: couponId, amountCents: 2_000 },
            idempotencyKey: `race-${token()}${token()}`,
          },
          db,
        ),
        (error: unknown) => (error as { code?: string }).code === 'VALIDATION',
      )

      const [redemptions] = await client<{ n: number }[]>`
        SELECT count(*)::int AS n FROM coupon_redemptions WHERE coupon_id = ${couponId}`
      assert.equal(redemptions!.n, 1)
    })

    it('una clave de idempotencia con cupón no duplica el canje', async () => {
      const { productId } = await seedProduct(20_000)
      const { code } = await createCoupon({ kind: 'fixed', value: 1_000 })

      const input = orderInput([{ productId }], code)
      const first = await placeStorefrontOrder(input, db)
      const second = await placeStorefrontOrder(input, db)

      assert.equal(second.orderNumber, first.orderNumber)
      const [redemptions] = await client<{ n: number }[]>`
        SELECT count(*)::int AS n FROM coupon_redemptions cr
        JOIN orders o ON o.id = cr.order_id
        WHERE o.number = ${first.orderNumber}`
      assert.equal(redemptions!.n, 1)
    })
  })
}
