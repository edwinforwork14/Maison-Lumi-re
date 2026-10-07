import { money, type Money } from '@/domain/money/money'

/**
 * Formateo de Money (defectos D17/D21): locale y moneda fijados por el sitio,
 * no hardcodeados en cada llamada. Único punto para cambiar de locale.
 *
 * Todo importe que llega aquí está en **céntimos**. No existen conversiones
 * implícitas: las de frontera (URL en euros → céntimos) están explícitas en
 * `centsFromMajor` / `majorFromCents`.
 */

// Se mantiene como módulo sin framework para poder usarse también en server
// (TanStack Start ejecuta este archivo en ambos runtimes).
const LOCALE = 'es-ES'
const CURRENCY: Money['currency'] = 'EUR'

export function formatMoney(m: Money): string {
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: m.amount % 100 === 0 ? 0 : 2,
  }).format(m.amount / 100)
}

/** Convierte euros "humanos" (URL, formularios) a `Money` en céntimos. */
export function centsFromMajor(major: number): Money {
  return money(Math.round(major * 100))
}

/** Euros opcionales → céntimos opcionales (cotas de precio en la URL). */
export function centsOfMajor(major: number | undefined): number | undefined {
  return major == null ? undefined : Math.round(major * 100)
}

/** Devuelve los euros de un importe, para inputs y URLs legibles. */
export function majorFromCents(m: Money): number {
  return m.amount / 100
}

/**
 * Formatea un importe expresado directamente en céntimos. Existe porque los
 * datos del catálogo viajan como enteros (`priceCents`) y la UI necesita
 * pintarlos sin inventar conversiones propias.
 */
export function formatCents(cents: number): string {
  return formatMoney(money(Math.round(cents)))
}

