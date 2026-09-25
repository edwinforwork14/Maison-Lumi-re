/**
 * Datos del mega dropdown multinivel (§8/§16 del brief).
 *
 * Los productos salen de la misma server function que usa la PLP
 * (`listProducts`) y, sobre todo, de la **misma clave de React Query**: si el
 * usuario ya visitó esa combinación de filtros en `/shop`, el dropdown la
 * reutiliza sin una sola request nueva. Sólo se consulta con el panel abierto
 * y nunca se pide el catálogo entero por abrir el menú: el filtro va acotado
 * a la sección/enlace activo y la vista recorta a 4 piezas.
 */

import { useQuery } from '@tanstack/react-query'
import { listProducts } from '@/features/commerce.api'
import { queryKeys } from '@/features/model/queries'
import type { SortId } from '@/domain/catalog'
import type { Product } from '@/domain/catalog/types'

/**
 * Filtro de navegación asociado a cada sección/enlace del menú.
 * Se declara junto al enlace en `buildNavSections` (sin parsear URLs, §8).
 */
export interface MegaFilters {
  readonly category?: string
  readonly collection?: string
  readonly material?: string
  readonly sort?: SortId
}

/**
 * Productos destacados del panel activo.
 *
 * La clave replica la firma de la PLP —
 * `products(category, collection, color, material, priceMin, priceMax, sort)`
 * — para que la caché se comparta en vez de duplicarse (contrato de
 * `features/model/queries.ts`).
 */
export function useMegaProducts(filters: MegaFilters, enabled: boolean) {
  const { data: products = [], isPending, isError } = useQuery({
    queryKey: queryKeys.products(
      filters.category,
      filters.collection,
      undefined,
      filters.material,
      undefined,
      undefined,
      filters.sort,
    ),
    queryFn: () =>
      listProducts({
        data: {
          category: filters.category,
          collection: filters.collection,
          colors: [],
          materials: filters.material ? [filters.material] : [],
          sort: filters.sort,
        },
      }),
    enabled,
  })

  return { products: products as Product[], isPending, isError }
}
