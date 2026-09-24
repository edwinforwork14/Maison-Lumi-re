import { money, type Money } from '../domain/money/money.ts'
import type { ShippingMethod, ShippingMethodId } from '../domain/pricing/rules.ts'
import {
  shippingCostFor as domainShippingCostFor,
  isFreeShipping,
  FREE_SHIPPING_THRESHOLD,
} from '../domain/pricing/rules.ts'

/**
 * Adaptador de semillas de envío (plan.md §8.2: data/shipping → seed + dominio).
 * El know-how (umbral, gratuidad) vive en `domain/pricing`; aquí solo están los
 * datos. Los precios van en **céntimos** (defecto D21).
 */
export const shippingMethods: ShippingMethod[] = [
  {
    id: 'standard',
    name: 'Estándar',
    description: '3 – 5 días laborables',
    price: money(1_200), // 12,00 €
  },
  {
    id: 'express',
    name: 'Express',
    description: '24 – 48 h',
    price: money(2_400), // 24,00 €
  },
]

export { FREE_SHIPPING_THRESHOLD as freeShippingThreshold, isFreeShipping }

export function shippingCostFor(methodId: ShippingMethodId, subtotal: Money): Money {
  return domainShippingCostFor(shippingMethods, methodId, subtotal)
}
