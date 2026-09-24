/**
 * Reglas puras de precios y envío (núcleo de dominio).
 *
 * Sin React, sin red, sin framework: solo reglas de negocio testeables.
 * TODO importe es `Money` (enteros en unidades menores, céntimos): el dominio
 * no maneja ninguna cantidad monetaria en euros decimales (defectos D17/D21).
 */

import { money, type Money } from '../money/money.ts'

export type ShippingMethodId = 'standard' | 'express'

export interface ShippingMethod {
  id: ShippingMethodId
  name: string
  description: string
  /** Precio del método, en céntimos. */
  price: Money
}

/** Umbral de envío gratuito: regla de dominio, no un dato del catálogo. */
export const FREE_SHIPPING_THRESHOLD = money(50_000) // 500,00 €

export function isFreeShipping(subtotal: Money): boolean {
  return subtotal.amount >= FREE_SHIPPING_THRESHOLD.amount
}

/**
 * Coste de envío para un método y subtotal dados.
 * Fuente única de verdad para carrito y checkout (corrige D5 del plan).
 */
export function shippingCostFor(
  methods: readonly ShippingMethod[],
  methodId: ShippingMethodId,
  subtotal: Money,
): Money {
  if (isFreeShipping(subtotal)) return money(0, subtotal.currency)
  const method = methods.find((m) => m.id === methodId)
  return method ? method.price : money(0, subtotal.currency)
}

/** Importe que falta para alcanzar el envío gratuito (cero si ya se alcanzó). */
export function amountToFreeShipping(subtotal: Money): Money {
  return money(
    Math.max(0, FREE_SHIPPING_THRESHOLD.amount - subtotal.amount),
    subtotal.currency,
  )
}
