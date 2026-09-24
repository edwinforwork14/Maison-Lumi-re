import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { products } from '../src/data/products.ts'
import {
  queryProductsFrom,
  type ProductLike,
} from '../src/domain/catalog/query.ts'

// shape extendido de las semillas (slug/stock/imágenes viven en el módulo de datos)
interface ProductSeed extends ProductLike {
  slug: string
  stock: number
  images: string[]
}

// Caracterización del catálogo real (plan.md Fase 1: misma conducta antes
// y después de la migración). La fuente usa la colección tal cual.
const source = {
  products: products as ProductLike[],
  collectionOf: (p: ProductLike) => (p as { collection?: string }).collection,
}

describe('semillas: invariantes del catálogo real', () => {
  it('contiene 28 productos (inventario verificado en plan.md §1.1)', () => {
    assert.equal(products.length, 28)
  })

  it('reparte 10 gafas, 7 bolsos, 6 zapatos y 5 accesorios', () => {
    const count = (category: string) =>
      products.filter((p) => p.category === category).length
    assert.equal(count('eyewear'), 10)
    assert.equal(count('bags'), 7)
    assert.equal(count('shoes'), 6)
    assert.equal(count('accessories'), 5)
  })

  it('slugs únicos y precios/stock válidos', () => {
    assert.equal(new Set(products.map((p) => p.slug)).size, 28)
    for (const p of products) {
      const seed = p as unknown as { slug: string; stock: number; images: string[] }
      assert.ok(seed.slug, 'cada producto tiene slug')
      assert.ok(p.price > 0, 'precio debe ser positivo')
      assert.ok(seed.stock >= 0, 'stock no puede ser negativo')
      assert.ok(seed.images.length > 0, 'requiere imágenes')
    }
  })

  it('dos productos agotados (Siena Frame y Escarpin Gala), como hoy', () => {
    const outOfStock = products.filter((p) => (p as ProductSeed).stock === 0)
    assert.equal(outOfStock.length, 2)
    assert.deepEqual(
      outOfStock.map((p) => (p as ProductSeed).slug).sort(),
      ['escarpin-gala', 'siena-frame'],
    )
  })
})

describe('semillas: pipeline de consulta sobre el catálogo real', () => {
  it('price-asc deja el primer precio ≤ último', () => {
    const sorted = queryProductsFrom(source, { sort: 'price-asc' })
    assert.equal(sorted.length, 28)
    assert.ok(sorted[0]!.price <= sorted[sorted.length - 1]!.price)
  })

  it('la categoría eyewear filtra exactamente sus 10 monturas', () => {
    const eyewear = queryProductsFrom(source, { category: 'eyewear' })
    assert.equal(eyewear.length, 10)
    assert.ok(eyewear.every((p) => p.category === 'eyewear'))
  })

  it('buscar "aurora" devuelve solo Aurora Frame', () => {
    const hits = queryProductsFrom(source, { search: 'aurora' })
    assert.equal(hits.length, 1)
    assert.equal((hits[0] as ProductSeed).slug, 'aurora-frame')
  })
})
