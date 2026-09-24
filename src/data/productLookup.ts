import { products } from './products'
import type { Product } from './types'

export function getProductById(id: string): Product | undefined {
  return products.find((p) => p.id === id)
}
