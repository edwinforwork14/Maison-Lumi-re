import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getHomepageContent } from '../src/server/services/storefront-content.ts'

/**
 * Portada pública (Plan 03, S4): sin base de datos configurada la portada
 * sirve el contenido por defecto — nunca se queda en blanco ni rompe la tienda.
 */
describe('getHomepageContent (modo sin BD)', () => {
  it('devuelve los bloques por defecto con hero y atelier', async () => {
    const { blocks } = await getHomepageContent()
    const hero = blocks.find((block) => block.key === 'hero')
    const atelier = blocks.find((block) => block.key === 'atelier')

    assert.ok(hero, 'el bloque hero debe existir')
    assert.ok(atelier, 'el bloque atelier debe existir')
    assert.equal(typeof hero?.title, 'string')
    assert.ok((hero?.title ?? '').length > 0)
    // El CTA del hero lleva a la tienda: la portada nunca es un callejón sin salida.
    assert.ok(hero?.ctaHref?.startsWith('/'))
    assert.ok((atelier?.subtitle ?? '').length > 0)
  })
})
