import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { coerceSettingValue } from '../src/server/services/storefront-orders.ts'

/**
 * Regresión del fallo que dejó el checkout sin enlace de WhatsApp.
 *
 * El driver devolvía el teléfono —guardado como string JSON `"34600111222"`—
 * como NÚMERO, y el lector exigía `typeof === 'string'`, así que devolvía null y
 * el botón no aparecía. La regla es coercionar según el `type` declarado de la
 * columna, nunca según la forma que traiga el JSON.
 */

describe('ajustes: el valor se coercioniza según su tipo declarado', () => {
  it('un string numérico sigue siendo string', () => {
    assert.equal(coerceSettingValue(34600111222, 'string'), '34600111222')
    assert.equal(coerceSettingValue('34600111222', 'string'), '34600111222')
    assert.equal(coerceSettingValue('EUR', 'string'), 'EUR')
  })

  it('un número escrito como texto se lee como número', () => {
    assert.equal(coerceSettingValue('50000', 'number'), 50_000)
    assert.equal(coerceSettingValue(50_000, 'number'), 50_000)
    assert.equal(coerceSettingValue('no-es-un-numero', 'number'), null)
  })

  it('un booleano se normaliza', () => {
    assert.equal(coerceSettingValue(true, 'boolean'), true)
    assert.equal(coerceSettingValue('true', 'boolean'), true)
    assert.equal(coerceSettingValue('false', 'boolean'), false)
  })

  it('un valor ausente no se inventa', () => {
    assert.equal(coerceSettingValue(null, 'string'), null)
    assert.equal(coerceSettingValue(undefined, 'number'), undefined)
  })
})
