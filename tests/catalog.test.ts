import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  queryProductsFrom,
  sortProducts,
  type ProductLike,
} from '../src/domain/catalog/query.ts'
import type { CatalogFilters } from '../src/domain/catalog/query.ts'

function product(overrides: Partial<ProductLike>): ProductLike {
  return {
    name: 'Pieza',
    description: 'Descripción',
    category: 'bags',
    price: 100,
    colors: ['Negro'],
    materials: ['Cuero'],
    featured: false,
    bestseller: false,
    isNew: false,
    ...overrides,
  }
}

const source = {
  products: [
    product({ name: 'Bolso Ámbar', price: 300, featured: true }),
    product({ name: 'Bolso Bruma', price: 150, bestseller: true }),
    product({
      name: 'Gafas Sol',
      price: 220,
      category: 'eyewear',
      materials: ['Acetato'],
      isNew: true,
    }),
    product({
      name: 'Bufón Seda',
      price: 90,
      category: 'accessories',
      colors: ['Marfil'],
      materials: ['Seda'],
    }),
  ],
  collectionOf: (p: ProductLike) => (p.category === 'bags' ? 'atelier' : undefined),
}

describe('catalog: filtrado', () => {
  it('filtra por categoría, colección, color, material y precio', () => {
    const cat = queryProductsFrom(source, { category: 'bags' })
    assert.equal(cat.length, 2)

    const col = queryProductsFrom(source, { collection: 'atelier' })
    assert.equal(col.length, 2)

    const color = queryProductsFrom(source, { colors: ['Marfil'] })
    assert.equal(color.length, 1)
    assert.equal(color[0]?.name, 'Bufón Seda')

    const mat = queryProductsFrom(source, { materials: ['Cuero'] })
    assert.equal(mat.length, 2)

    const price = queryProductsFrom(source, { priceMin: 150, priceMax: 300 })
    assert.equal(price.length, 3)
  })

  it('busca por nombre y descripción sin distinguir mayúsculas', () => {
    const byName = queryProductsFrom(source, { search: '  SOL  ' })
    assert.equal(byName.length, 1)
    assert.equal(byName[0]?.name, 'Gafas Sol')

    assert.equal(
      queryProductsFrom(source, { search: '   ' }).length,
      4,
      'una búsqueda en blanco no filtra',
    )
  })

  it('combina filtros', () => {
    const combined = queryProductsFrom(source, {
      category: 'bags',
      priceMax: 200,
    })
    assert.equal(combined.length, 1)
    assert.equal(combined[0]?.name, 'Bolso Bruma')
  })
})

describe('catalog: ordenado (una sola pasada, defecto D3)', () => {
  it('recommended ordena por featured y luego bestseller', () => {
    const sorted = sortProducts(source.products, 'recommended')
    assert.equal(sorted[0]?.name, 'Bolso Ámbar')
    assert.equal(sorted[1]?.name, 'Bolso Bruma')
  })

  it('price-asc y price-desc', () => {
    const asc = sortProducts(source.products, 'price-asc')
    assert.equal(asc[0]?.price, 90)
    const desc = sortProducts(source.products, 'price-desc')
    assert.equal(desc[0]?.price, 300)
  })

  it('new y bestsellers', () => {
    assert.equal(sortProducts(source.products, 'new')[0]?.name, 'Gafas Sol')
    assert.equal(
      sortProducts(source.products, 'bestsellers')[0]?.name,
      'Bolso Bruma',
    )
  })

  it('queryProductsFrom ya devuelve la lista ordenada según filters.sort', () => {
    const sorted = queryProductsFrom(source, { sort: 'price-asc' })
    const prices = sorted.map((p) => p.price)
    assert.deepEqual(
      prices,
      [...prices].sort((a, b) => a - b),
      'la lista viene ordenada por precio',
    )
  })

  it('no muta la lista original', () => {
    const original = [...source.products]
    sortProducts(source.products, 'price-asc')
    assert.deepEqual(source.products, original)
  })
})

describe('catalog: sanidad de la fuente', () => {
  it('sin filtros devuelve todos los productos', () => {
    const all: CatalogFilters = {}
    assert.equal(queryProductsFrom(source, all).length, 4)
  })
})
