import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildRobotsTxt, staticEntries } from '../src/server/services/seo.ts'

describe('seo: robots.txt', () => {
  it('no indexa el panel, la cuenta ni el checkout y apunta al sitemap', () => {
    const robots = buildRobotsTxt('https://maisonlumiere.example')
    assert.match(robots, /User-agent: \*/)
    assert.match(robots, /Disallow: \/admin/)
    assert.match(robots, /Disallow: \/account/)
    assert.match(robots, /Disallow: \/checkout/)
    assert.match(robots, /Sitemap: https:\/\/maisonlumiere\.example\/api\/sitemap\.xml/)
  })
})

describe('seo: páginas estáticas del sitemap', () => {
  it('incluye portada, catálogo, carrito y checkout bajo la base indicada', () => {
    const entries = staticEntries('https://maisonlumiere.example')
    assert.deepEqual(
      entries.map((entry) => entry.loc),
      [
        'https://maisonlumiere.example',
        'https://maisonlumiere.example/shop',
        'https://maisonlumiere.example/cart',
        'https://maisonlumiere.example/checkout',
      ],
    )
    // Las páginas estáticas no tienen fecha propia: no se inventa lastmod.
    assert.ok(entries.every((entry) => entry.lastmod === undefined))
  })
})
