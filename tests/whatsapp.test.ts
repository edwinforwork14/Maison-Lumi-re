import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildWhatsAppOrderLink,
  buildWhatsAppOrderMessage,
  normalizeWhatsAppPhone,
} from '../src/lib/whatsapp.ts'
import { money, add, multiply } from '../src/domain/money/money.ts'
import type { CartQuote } from '../src/server/services/cart-quote.ts'

/**
 * El pedido se cierra por WhatsApp (la tienda no cobra en línea), así que el
 * mensaje que recibe la tienda es la última pieza visible del embudo: se prueba
 * como contrato, sin navegador.
 */

const line = {
  productId: 'p1',
  variantId: 'v1',
  slug: 'aurora-frame',
  sku: 'AURORA-BEIGE',
  name: 'Aurora Frame',
  color: 'Beige',
  image: '',
  unitPrice: money(28_000),
  quantity: 2,
  lineTotal: multiply(money(28_000), 2),
  availableStock: 5,
  availability: 'in_stock' as const,
}

const quote: CartQuote = {
  lines: [line],
  subtotal: line.lineTotal,
  discount: money(0),
  shipping: money(1_200),
  total: add(line.lineTotal, money(1_200)),
  freeShippingRemaining: money(0),
  shippingOptions: [],
  coupon: null,
}

const summary = {
  orderNumber: 'ML-001234',
  customerName: 'Ana García',
  city: 'Madrid',
  shippingLabel: 'Estándar',
  quote,
}

describe('whatsapp: normalización del número', () => {
  it('acepta formatos humanos y devuelve sólo dígitos', () => {
    assert.equal(normalizeWhatsAppPhone('+34 600-11-12-22'), '34600111222')
    assert.equal(normalizeWhatsAppPhone('(34) 600 111 222'), '34600111222')
  })

  it('rechaza lo que no es un número utilizable', () => {
    assert.equal(normalizeWhatsAppPhone('123'), null)
    assert.equal(normalizeWhatsAppPhone(''), null)
    assert.equal(normalizeWhatsAppPhone(null), null)
    assert.equal(normalizeWhatsAppPhone(undefined), null)
  })
})

describe('whatsapp: mensaje y enlace del pedido', () => {
  it('el mensaje lleva número de pedido, líneas, totales y cliente', () => {
    const message = buildWhatsAppOrderMessage(summary)
    assert.match(message, /ML-001234/)
    assert.match(message, /Aurora Frame \(Beige\) ×2/)
    assert.match(message, /560,00 €/)
    assert.match(message, /Total: 572,00 €/)
    assert.match(message, /Ana García/)
    assert.match(message, /Madrid/)
  })

  it('marca el envío como gratuito cuando no se cobra', () => {
    const free: CartQuote = { ...quote, shipping: money(0), total: quote.subtotal, freeShippingRemaining: money(0) }
    const message = buildWhatsAppOrderMessage({ ...summary, quote: free })
    assert.match(message, /Envío \(Estándar\): gratuito/)
  })

  it('el enlace apunta a wa.me con el mensaje codificado', () => {
    const link = buildWhatsAppOrderLink(
      { phone: '+34 600 111 222', displayName: 'Tienda' },
      summary,
    )
    assert.ok(link)
    assert.ok(link!.href.startsWith('https://wa.me/34600111222?text='))
    assert.equal(decodeURIComponent(link!.href.split('text=')[1]!), link!.message)
  })

  it('sin número configurado no hay enlace (la UI debe avisar, no romper)', () => {
    assert.equal(buildWhatsAppOrderLink(null, summary), null)
    assert.equal(
      buildWhatsAppOrderLink({ phone: 'nope', displayName: 'Tienda' }, summary),
      null,
    )
  })
})
