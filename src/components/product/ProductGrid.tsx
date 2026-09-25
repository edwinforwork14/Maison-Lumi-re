import type { Product } from '@/domain/catalog/types'
import { ProductCard } from './ProductCard'

/**
 * Rejilla de la referencia (Plan 04 §2.7): **a sangre** (sin gutter entre
 * tarjetas), 2 columnas en móvil y 4 ≥768 px. La separación visual la aporta
 * el padding interno de cada tarjeta, no el gap.
 */
export function ProductGrid({ products }: { products: Product[] }) {
  return (
    <ul className="grid grid-cols-2 md:grid-cols-4">
      {products.map((p) => (
        <li key={p.id} className="min-w-0">
          <ProductCard product={p} />
        </li>
      ))}
    </ul>
  )
}
