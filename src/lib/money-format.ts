import type { Money } from '@/domain/money/money'

/**
 * Formateo de Money (defecto D17): locale y moneda fijados por el sitio,
 * no hardcodeados en cada llamada. Un único punto para cambiar de locale.
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

/** Compat: formatea una cantidad en euros decimales (semillas actuales). */
export function formatMajor(value: number): string {
  return formatMoney({ amount: Math.round(value * 100), currency: CURRENCY })
}
