import type { ShippingMethod } from './types'

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

export const freeShippingThreshold = 500

export function shippingCostFor(
  methodId: ShippingMethod['id'],
  subtotal: number,
): number {
  if (subtotal >= freeShippingThreshold) return 0
  return shippingMethods.find((m) => m.id === methodId)?.price ?? 0
}
