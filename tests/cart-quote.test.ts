import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ownsOrder } from '../src/server/services/cart-quote.ts'

/**
 * Regla de propiedad del pedido (defecto D32).
 *
 * Es la función que decide si alguien puede leer un pedido, así que se prueba
 * como contrato puro, sin servidor ni base de datos. Los servicios en memoria
 * que antes la acompañaban (y que no descontaban stock) se eliminaron: la tienda
 * opera siempre sobre PostgreSQL.
 */

describe('pedidos: la propiedad decide quién puede leer (D32)', () => {
  const order = { customer: { email: 'Ana.Garcia@example.com' } }

  it('el dueño reconoce su pedido sin importar mayúsculas ni espacios', () => {
    assert.equal(ownsOrder(order, 'ana.garcia@example.com'), true)
    assert.equal(ownsOrder(order, '  ANA.GARCIA@EXAMPLE.COM  '), true)
  })

  it('otro usuario no puede leerlo, y sin sesión tampoco', () => {
    assert.equal(ownsOrder(order, 'otro@example.com'), false)
    assert.equal(ownsOrder(order, null), false)
    assert.equal(ownsOrder(order, undefined), false)
    assert.equal(ownsOrder(order, ''), false)
  })
})
