import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  placeOrder,
  quoteCart,
  listOrdersByCustomer,
} from '../src/server/services/commerce.ts'
import { catalogRepository } from '../src/server/seed/catalog.ts'

/**
 * Cotización y pedidos en el servidor (defectos D5, D17, D18, D21).
 * El servidor es la única autoridad del dinero: estos tests fijan que los
 * importes son `Money` en céntimos, que el stock viaja con cada línea y que
 * no se puede pedir más de lo disponible.
 */

// Aurora Frame: 280,00 €, dos colores con 7 unidades cada uno.
const AURORA = { productId: 'p-01', color: 'Beige' }
// Siena Frame: agotado.
const SIENA = { productId: 'p-04', color: 'Marrón' }

const customer = {
  firstName: 'Ana',
  lastName: 'García',
  email: 'ana@example.com',
  address: 'Calle Serrano 21',
  city: 'Madrid',
  postalCode: '28001',
  country: 'España',
}

describe('quoteCart: importes en céntimos (D17/D21)', () => {
  it('devuelve Money entero en céntimos, nunca euros decimales', () => {
    const quote = quoteCart({ lines: [{ ...AURORA, quantity: 1 }] })
    const line = quote.lines[0]!
    assert.equal(line.unitPrice.amount, 28_000)
    assert.equal(line.unitPrice.currency, 'EUR')
    assert.equal(line.lineTotal.amount, 28_000)
    assert.ok(Number.isInteger(quote.subtotal.amount))
    assert.ok(Number.isInteger(quote.total.amount))
  })

  it('suma líneas multiplicando por cantidad', () => {
    const quote = quoteCart({
      lines: [
        { ...AURORA, quantity: 1 },
        { productId: 'p-02', color: 'Negro', quantity: 2 },
      ],
    })
    assert.equal(quote.lines.length, 2)
    assert.equal(quote.subtotal.amount, 28_000 + 31_000 * 2)
  })

  it('ignora líneas de productos retirados o colores inexistentes', () => {
    const quote = quoteCart({
      lines: [
        { productId: 'no-existe', color: 'Beige', quantity: 1 },
        { productId: 'p-01', color: 'Fucsia', quantity: 1 },
      ],
    })
    assert.equal(quote.lines.length, 0)
    assert.equal(quote.subtotal.amount, 0)
  })
})

describe('quoteCart: envío y umbral desde el servidor (D5/D37)', () => {
  it('bajo el umbral cobra el método elegido y anuncia lo que falta', () => {
    const quote = quoteCart({ lines: [{ ...AURORA, quantity: 1 }], shippingMethod: 'express' })
    assert.equal(quote.shipping.amount, 2_400)
    assert.equal(quote.total.amount, 28_000 + 2_400)
    assert.equal(quote.freeShippingRemaining.amount, 22_000)
  })

  it('al cruzar el umbral el envío es gratuito en todos los métodos', () => {
    const quote = quoteCart({ lines: [{ ...AURORA, quantity: 2 }] })
    assert.equal(quote.subtotal.amount, 56_000)
    assert.equal(quote.shipping.amount, 0)
    assert.equal(quote.freeShippingRemaining.amount, 0)
    assert.ok(quote.shippingOptions.every((o) => o.free && o.price.amount === 0))
  })

  it('expone los métodos de envío con su precio para que la UI no los duplique', () => {
    const quote = quoteCart({ lines: [{ ...AURORA, quantity: 1 }] })
    assert.deepEqual(
      quote.shippingOptions.map((o) => [o.id, o.price.amount]),
      [
        ['standard', 1_200],
        ['express', 2_400],
      ],
    )
  })
})

describe('quoteCart: disponibilidad por SKU (D14/D18)', () => {
  it('cada línea lleva el stock real del SKU', () => {
    const quote = quoteCart({ lines: [{ ...AURORA, quantity: 1 }] })
    const line = quote.lines[0]!
    const variant = catalogRepository.findVariant(AURORA.productId, AURORA.color)!
    assert.equal(line.availableStock, variant.stock)
    assert.equal(line.sku, variant.sku)
    assert.equal(line.slug, 'aurora-frame')
  })

  it('marca agotado y stock bajo según las unidades disponibles', () => {
    const agotado = quoteCart({ lines: [{ ...SIENA, quantity: 1 }] })
    assert.equal(agotado.lines[0]?.availability, 'out_of_stock')
    assert.equal(agotado.lines[0]?.availableStock, 0)

    const disponible = quoteCart({ lines: [{ ...AURORA, quantity: 1 }] })
    assert.equal(disponible.lines[0]?.availability, 'in_stock')
  })
})

describe('placeOrder: stock, totales e idempotencia (D18/D27)', () => {
  it('rechaza pedir más unidades de las disponibles', () => {
    assert.throws(
      () =>
        placeOrder({
          lines: [{ ...AURORA, quantity: 99 }],
          customer,
          idempotencyKey: crypto.randomUUID(),
        }),
      /Solo quedan|Sin stock/,
    )
  })

  it('rechaza productos agotados', () => {
    assert.throws(
      () =>
        placeOrder({
          lines: [{ ...SIENA, quantity: 1 }],
          customer,
          idempotencyKey: crypto.randomUUID(),
        }),
      /Sin stock/,
    )
  })

  it('rechaza un carrito vacío', () => {
    assert.throws(
      () => placeOrder({ lines: [], customer, idempotencyKey: crypto.randomUUID() }),
      /vacío/,
    )
  })

  it('crea el pedido con totales en céntimos y lo devuelve en la lista del cliente', () => {
    const key = crypto.randomUUID()
    const order = placeOrder({
      lines: [{ ...AURORA, quantity: 1 }],
      shippingMethod: 'express',
      customer,
      idempotencyKey: key,
    })
    assert.equal(order.totals.subtotal.amount, 28_000)
    assert.equal(order.totals.shipping.amount, 2_400)
    assert.equal(order.totals.total.amount, 30_400)
    assert.ok(order.number.startsWith('ML-'))

    const listed = listOrdersByCustomer('  ANA@example.com ')
    assert.equal(listed[0]?.number, order.number)
    assert.equal(listed[0]?.total.amount, 30_400)
    assert.equal(listed[0]?.itemsCount, 1)
  })

  it('la misma clave de idempotencia devuelve el mismo pedido (doble clic)', () => {
    const key = crypto.randomUUID()
    const first = placeOrder({
      lines: [{ ...AURORA, quantity: 1 }],
      customer,
      idempotencyKey: key,
    })
    const second = placeOrder({
      lines: [{ ...AURORA, quantity: 1 }],
      customer,
      idempotencyKey: key,
    })
    assert.equal(first.number, second.number)
  })
})
