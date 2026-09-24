import type { Category, CategoryId } from './types'

export const categories: Category[] = [
  {
    id: 'eyewear',
    name: 'Gafas',
    slug: 'eyewear',
    description: 'Monturas de acetato y metal, hechas a mano.',
    editorial:
      'Líneas puras y proporciones estudiadas. Cada montura se pulen a mano en ateliers familiares con décadas de oficio.',
  },
  {
    id: 'bags',
    name: 'Bolsos',
    slug: 'bags',
    description: 'Cuero de curtido vegetal y herrajes bañados en oro.',
    editorial:
      'Siluetas arquitectónicas en cueros de curtido vegetal, cosidos a mano pieza a pieza.',
  },
  {
    id: 'shoes',
    name: 'Zapatos',
    slug: 'shoes',
    description: 'Formas esculturales con comodidad de.daily.',
    editorial:
      'Formas esculturales y pieles suaves. Cada par se construye sobre la horma durante semanas antes de salir del taller.',
  },
  {
    id: 'accessories',
    name: 'Accesorios',
    slug: 'accessories',
    description: 'Detalles que completan la mirada.',
    editorial:
      'Bufandas de seda, cinturones finos y pequeñas piezas de metal pulido para terminar cada look.',
  },
]

export const categoryMap = new Map<CategoryId, Category>(
  categories.map((c) => [c.id, c]),
)
