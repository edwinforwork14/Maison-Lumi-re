/**
 * Datos de navegación mínimos que el layout inyecta. Antes este componente
 * importaba los mocks de datos del catálogo, lo que metía el catálogo entero en el bundle
 * del navegador (defecto D34); ahora los recibe ya resueltos por el servidor.
 */
import type { MegaFilters } from './mega-menu.data'

export interface NavCategory {
  id: string
  name: string
  editorial: string
}
export interface NavCollection {
  id: string
  name: string
}

export interface NavSection {
  label: string
  to: string
  /** Filtro de catálogo que representa la sección (dropdown multinivel §3). */
  filters?: MegaFilters
  sections: {
    title: string
    links: { label: string; to: string; filters?: MegaFilters }[]
  }[]
  highlight?: { title: string; text: string; to: string; cta: string }
}

export function buildNavSections(
  categories: readonly NavCategory[],
  collections: readonly NavCollection[],
): NavSection[] {
  return [
  {
    label: 'Novedades',
    to: '/shop',
    filters: { sort: 'new' },
    sections: [
      {
        title: 'Descubrir',
        links: [
          { label: 'Todo el catálogo', to: '/shop', filters: {} },
          { label: 'Nuevos ingresos', to: '/shop?sort=new', filters: { sort: 'new' } },
          { label: 'Bestsellers', to: '/shop?sort=bestsellers', filters: { sort: 'bestsellers' } },
        ],
      },
      {
        title: 'Colecciones',
        links: collections.map((c) => ({
          label: c.name,
          to: `/shop?collection=${c.id}`,
          filters: { collection: c.id },
        })),
      },
    ],
    highlight: {
      title: 'Lumière',
      text: 'Luz dorada y metal pulido para la nueva temporada.',
      to: '/shop?collection=lumiere',
      cta: 'Descubrir',
    },
  },
  ...categories.map((cat) => ({
    label: cat.name,
    to: `/shop?category=${cat.id}`,
    filters: { category: cat.id },
    sections: [
      {
        title: cat.name,
        links: [
          { label: `Todo ${cat.name.toLowerCase()}`, to: `/shop?category=${cat.id}`, filters: { category: cat.id } },
          ...collections.map((c) => ({
            label: c.name,
            to: `/shop?category=${cat.id}&collection=${c.id}`,
            filters: { category: cat.id, collection: c.id },
          })),
        ],
      },
      {
        title: 'Por material',
        links:
          cat.id === 'eyewear'
            ? [
                { label: 'Acetato', to: '/shop?category=eyewear&material=Acetato', filters: { category: 'eyewear', material: 'Acetato' } },
                { label: 'Metal', to: '/shop?category=eyewear&material=Metal', filters: { category: 'eyewear', material: 'Metal' } },
              ]
            : cat.id === 'accessories'
              ? [
                  { label: 'Seda', to: '/shop?category=accessories&material=Tela', filters: { category: 'accessories', material: 'Tela' } },
                  { label: 'Cuero', to: '/shop?category=accessories&material=Cuero', filters: { category: 'accessories', material: 'Cuero' } },
                ]
              : [{ label: 'Cuero', to: `/shop?category=${cat.id}&material=Cuero`, filters: { category: cat.id, material: 'Cuero' } }],
      },
    ],
    highlight: {
      title: cat.name,
      text: cat.editorial,
      to: `/shop?category=${cat.id}`,
      cta: 'Ver colección',
    },
  })),
  ]
}

/**
 * Modelo de navegación del chrome (Plan 04 §7.2): los tipos y el builder se
 * CONSERVAN —los consume `MenuModal`, el `MegaDropdown` y el layout—; cada
 * sección/enlace lleva además su `filters` tipado para que el dropdown cargue
 * productos reales sin parsear URLs (brief §8).
 */
