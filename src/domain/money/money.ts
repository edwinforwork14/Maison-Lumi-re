/**
 * Money: importes como enteros en unidades menores (céntimos) + moneda.
 * Nunca float para dinero. Aritmética pura, testeable sin framework.
 */

export type Currency = 'EUR'

export interface Money {
  /** Unidades menores (céntimos), entero. */
  readonly amount: number
  readonly currency: Currency
}

export function money(amount: number, currency: Currency = 'EUR'): Money {
  const cents = Math.round(amount)
  if (!Number.isFinite(cents)) {
    throw new RangeError(`Money.amount no finito: ${amount}`)
  }
  return { amount: cents, currency }
}

/** Crea Money desde una cantidad "mayor" (euros decimales, p. ej. 12.5 €). */
export function moneyFromMajor(major: number, currency: Currency = 'EUR'): Money {
  return money(Math.round(major * 100), currency)
}

export function add(a: Money, b: Money): Money {
  assertSame(a, b)
  return money(a.amount + b.amount, a.currency)
}

export function subtract(a: Money, b: Money): Money {
  assertSame(a, b)
  return money(a.amount - b.amount, a.currency)
}

export function multiply(m: Money, qty: number): Money {
  return money(m.amount * qty, m.currency)
}

export function percentage(m: Money, pct: number): Money {
  return money(Math.round((m.amount * pct) / 100), m.currency)
}

/** Reparte proporcionalmente sin perder céntimos (el resto va a la primera parte). */
export function allocate(m: Money, parts: number[]): Money[] {
  if (parts.length === 0) return []
  const total = parts.reduce((s, p) => s + p, 0)
  if (total === 0) {
    return parts.map(() => money(0, m.currency))
  }
  const raw = parts.map((p) => (m.amount * p) / total)
  const rounded = raw.map((r) => Math.floor(r))
  let remainder = m.amount - rounded.reduce((s, r) => s + r, 0)
  return rounded.map((r) => {
    const result = remainder > 0 ? r + 1 : r
    remainder -= remainder > 0 ? 1 : 0
    return money(result, m.currency)
  })
}

export function isZero(m: Money): boolean {
  return m.amount === 0
}

/** Cero en una moneda (para totales y envío gratuito). */
export function zero(currency: Currency = 'EUR'): Money {
  return money(0, currency)
}

/** Suma de importes homogéneos; lista vacía ⇒ cero. */
export function sum(items: readonly Money[], currency: Currency = 'EUR'): Money {
  return items.reduce<Money>((acc, m) => add(acc, m), zero(currency))
}

export function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amount === b.amount
}

function assertSame(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new RangeError(`Monedas distintas: ${a.currency} vs ${b.currency}`)
  }
}
