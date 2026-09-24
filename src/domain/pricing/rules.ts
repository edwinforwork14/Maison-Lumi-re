/**
 * Reglas puras de precios y envío (núcleo de dominio).
 *
 * Sin React, sin red, sin framework: solo reglas de negocio testeables.
 * Las cantidades son números "mayores" (euros) mientras el modelo de datos
 * no migre a Money en unidades menores (plan.md Fase 2). La firma ya es la
 * definitiva, de modo que migrar el formato no cambiará a los llamadores.
 */

export interface ShippingMethod {
  id: ShippingMethodId
  name: string
  description: string
  price: number
}

export type ShippingMethodId = 'standard' | 'express'

/** Umbral de envío gratuito: regla de dominio, no un dato del catálogo. */
export const FREE_SHIPPING_THRESHOLD = 500

export function isFreeShipping(subtotal: number): boolean {
  return subtotal >= FREE_SHIPPING_THRESHOLD
}

/**
 * Coste de envío para un método y subtotal dados.
 * Fuente única de verdad para carrito y checkout (corrige D5 del plan).
 */
export function shippingCostFor(
  methods: readonly ShippingMethod[],
  methodId: ShippingMethodId,
  subtotal: number,
): number {
  if (isFreeShipping(subtotal)) return 0
  return methods.find((m) => m.id === methodId)?.price ?? 0
}

/** Importe que falta para alcanzar el envío gratuito (0 si ya se alcanzó). */
export function amountToFreeShipping(subtotal: number): number {
  return Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal)
}
