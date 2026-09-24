import type { ShippingMethod, ShippingMethodId } from '@/domain/pricing'
import {
  shippingCostFor as domainShippingCostFor,
  isFreeShipping,
  FREE_SHIPPING_THRESHOLD,
} from '@/domain/pricing'

/**
 * Adaptador de semillas de envío (plan.md §8.2: data/shipping → seed + dominio).
 * El know-how (umbral, gratuidad) vive en domain/pricing; aquí solo están los datos.
 */
export const shippingMethods: ShippingMethod[] = [
  {
    id: 'standard',
    name: 'Estándar',
    description: '3 – 5 días laborables',
    price: 12,
  },
  {
    id: 'express',
    name: 'Express',
    description: '24 – 48 h',
    price: 24,
  },
]

export { FREE_SHIPPING_THRESHOLD as freeShippingThreshold, isFreeShipping }

export function shippingCostFor(
  methodId: ShippingMethodId,
  subtotal: number,
): number {
  return domainShippingCostFor(shippingMethods, methodId, subtotal)
}
