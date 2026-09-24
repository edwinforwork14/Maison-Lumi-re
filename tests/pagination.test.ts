import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  clampPageSize,
  decodeCursor,
  encodeCursor,
  paginate,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from '../src/server/db/pagination.ts'

/** Contrato de paginación por cursor (plan 01, F4). No necesita base de datos. */

interface Row {
  id: string
  updatedAt: string
}

const row = (n: number): Row => ({
  id: `id-${n}`,
  updatedAt: `2026-01-${String(n).padStart(2, '0')}T00:00:00.000Z`,
})

describe('paginación: tamaño de página', () => {
  it('nunca confía en el tamaño pedido por el cliente', () => {
    assert.equal(clampPageSize(undefined), DEFAULT_PAGE_SIZE)
    assert.equal(clampPageSize(0), DEFAULT_PAGE_SIZE)
    assert.equal(clampPageSize(-5), DEFAULT_PAGE_SIZE)
    assert.equal(clampPageSize(Number.NaN), DEFAULT_PAGE_SIZE)
    assert.equal(clampPageSize(10_000), MAX_PAGE_SIZE)
    assert.equal(clampPageSize(15), 15)
    assert.equal(clampPageSize(10.9), 10)
  })
})

describe('paginación: cursor opaco y a prueba de manipulación', () => {
  it('codifica y decodifica un cursor', () => {
    const cursor = { k: '2026-01-01T00:00:00.000Z', id: 'id-1' }
    assert.deepEqual(decodeCursor(encodeCursor(cursor)), cursor)
  })

  it('un cursor corrupto o manipulado se ignora (devuelve null)', () => {
    for (const bad of [null, undefined, '', 'no-es-base64-json', Buffer.from('{}').toString('base64url')]) {
      assert.equal(decodeCursor(bad as string), null)
    }
    const tampered = Buffer.from(JSON.stringify({ k: '', id: 'x' })).toString('base64url')
    assert.equal(decodeCursor(tampered), null)
  })
})

describe('paginación: páginas estables', () => {
  it('recorta al tamaño y ofrece cursor solo si hay más', () => {
    const rows = [row(1), row(2), row(3), row(4), row(5)]
    // Se pide una fila de más, así que hay 2 páginas de 2.
    const first = paginate(rows, 2, (r) => r.updatedAt, (r) => r.id)
    assert.equal(first.items.length, 2)
    assert.equal(first.hasMore, true)
    assert.equal(first.nextCursor, encodeCursor({ k: row(2).updatedAt, id: row(2).id }))
  })

  it('la última página no devuelve cursor', () => {
    const last = paginate([row(4), row(5)], 2, (r) => r.updatedAt, (r) => r.id)
    assert.equal(last.items.length, 2)
    assert.equal(last.hasMore, false)
    assert.equal(last.nextCursor, null)
  })

  it('una lista vacía es una página vacía sin cursor', () => {
    const empty = paginate([], 10, (r: Row) => r.updatedAt, (r) => r.id)
    assert.deepEqual(empty.items, [])
    assert.equal(empty.nextCursor, null)
    assert.equal(empty.hasMore, false)
  })

  it('el cursor apunta a la última fila devuelta, no a la siguiente', () => {
    const rows = [row(1), row(2), row(3)]
    const page = paginate(rows, 2, (r) => r.updatedAt, (r) => r.id)
    const decoded = decodeCursor(page.nextCursor)
    assert.equal(decoded?.id, 'id-2')
    // Con ese cursor, la consulta siguiente pediría filas con clave > id-2.
    assert.equal(decoded?.k, row(2).updatedAt)
  })
})
