import type { Collection, CollectionId } from './types'

export const collections: Collection[] = [
  {
    id: 'atelier',
    name: 'Atelier',
    slug: 'atelier',
    description: 'El origen. Piezas de oficio puro.',
  },
  {
    id: 'lumiere',
    name: 'Lumière',
    slug: 'lumiere',
    description: 'Luz dorada, transparencias y metal pulido.',
  },
  {
    id: 'nocturne',
    name: 'Nocturne',
    slug: 'nocturne',
    description: 'Negros profundos y líneas nocturnas.',
  },
]

export const collectionMap = new Map<CollectionId, Collection>(
  collections.map((c) => [c.id, c]),
)
