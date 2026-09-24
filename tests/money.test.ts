import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  money,
  moneyFromMajor,
  add,
  subtract,
  multiply,
  percentage,
  allocate,
  isZero,
  equals,
} from '../src/domain/money/money.ts'

describe('money: construcción', () => {
  it('redondea al céntimo más próximo', () => {
    assert.deepEqual(moneyFromMajor(12.345), { amount: 1235, currency: 'EUR' })
    assert.deepEqual(money(100), { amount: 100, currency: 'EUR' })
  })

  it('rechaza importes no finitos', () => {
    assert.throws(() => money(Number.NaN))
    assert.throws(() => money(Number.POSITIVE_INFINITY))
  })
})

describe('money: aritmética', () => {
  it('add y subtract respetan la moneda', () => {
    assert.deepEqual(add(money(100), money(50)).amount, 150)
    assert.deepEqual(subtract(money(100), money(50)).amount, 50)
    assert.throws(() => add(money(100, 'EUR'), { amount: 1, currency: 'USD' as never }))
  })

  it('multiply por cantidad entera y decimal', () => {
    assert.deepEqual(multiply(money(1999), 3).amount, 5997)
    assert.deepEqual(multiply(money(1050), 2).amount, 2100)
  })

  it('percentage redondea correctamente', () => {
    assert.deepEqual(percentage(money(999), 21).amount, 210)
  })

  it('allocate reparte sin perder céntimos', () => {
    const parts = allocate(money(1000), [1, 1, 1])
    assert.equal(parts.reduce((s, p) => s + p.amount, 0), 1000)
    assert.deepEqual(parts.map((p) => p.amount), [334, 333, 333])
  })

  it('allocate con total cero devuelve ceros', () => {
    const parts = allocate(money(500), [0, 0])
    assert.ok(parts.every((p) => p.amount === 0))
  })
})

describe('money: comparación', () => {
  it('isZero y equals', () => {
    assert.ok(isZero(money(0)))
    assert.ok(equals(money(500), money(500)))
    assert.ok(!equals(money(500), money(499)))
  })
})
