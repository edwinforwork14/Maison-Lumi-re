/**
 * Compat (plan §8.2): formatPrice delega en lib/money-format, que ya opera
 * sobre Money con locale/moneda centralizados (defecto D17).
 */
export { formatMoney as formatPriceFromMoney, formatMajor as formatPrice } from './money-format'

/**
 * TEMPORAL (se elimina en Fase 2): la numeración de pedidos debe generarse
 * en el servidor (server/services/place-order). Mientras el checkout siga
 * en cliente, se conserva aquí para no romper el embudo.
 */
export function orderNumber(): string {
  const stamp = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `ML-${stamp}-${rand}`
}

