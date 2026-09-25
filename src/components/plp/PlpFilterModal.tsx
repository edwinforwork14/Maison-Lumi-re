import type { SortId } from '@/domain/catalog'
import { Modal } from '@/components/ui/Modal'
import { Accordion } from '@/components/ui/Accordion'
import { Checkbox } from '@/components/ui/Checkbox'
import { Radio } from '@/components/ui/Radio'
import { Button } from '@/components/ui/Button'

/**
 * Modal «Filtros y orden» (Plan 04 §2.9):
 *
 * - Orden en radios («Recomendado» por defecto).
 * - Facetas en acordeones `--subtle`, primero abierto; etiquetas
 *   capitalizadas.
 * - Pie con «Borrar todo» (deshabilitado sin filtros) y «Mostrar N
 *   resultados».
 *
 * Los controles sólo escriben en la URL mediante los callbacks de la ruta
 * (`setParam` / `toggleArrayParam`): la ruta conserva `validateSearch`,
 * `loader` y `useQuery` intactos (frontera del plan, §10).
 */

/** Shape de los filtros de la PLP: idéntico al de la ruta (structural). */
export interface PlpFilters {
  readonly category?: string
  readonly collection?: string
  readonly color?: string | string[]
  readonly material?: string | string[]
  readonly priceMin?: number
  readonly priceMax?: number
  readonly sort?: SortId
}

const asArray = (v: string | string[] | undefined): string[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v]

const sortOptions: { id: SortId; label: string }[] = [
  { id: 'recommended', label: 'Recomendado' },
  { id: 'price-desc', label: 'Precio de mayor a menor' },
  { id: 'price-asc', label: 'Precio de menor a mayor' },
  { id: 'bestsellers', label: 'Los más vendidos' },
  { id: 'new', label: 'Nuevos' },
]

const priceRanges: { label: string; priceMin?: number; priceMax?: number }[] = [
  { label: 'Hasta 300 €', priceMax: 300 },
  { label: '300 – 600 €', priceMin: 300, priceMax: 600 },
  { label: '600 – 1.000 €', priceMin: 600, priceMax: 1000 },
  { label: 'Más de 1.000 €', priceMin: 1000 },
]

export interface PlpFilterModalProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly filters: PlpFilters
  readonly categories: readonly { id: string; name: string }[]
  readonly collections: readonly { id: string; name: string }[]
  readonly facets: { colors: string[]; materials: string[] }
  readonly resultCount: number
  readonly activeFilterCount: number
  readonly setParam: (updates: Partial<PlpFilters>) => void
  readonly toggleArrayParam: (key: 'color' | 'material', value: string) => void
  readonly clearFilters: () => void
}

export function PlpFilterModal({
  open,
  onClose,
  filters,
  categories,
  collections,
  facets,
  resultCount,
  activeFilterCount,
  setParam,
  toggleArrayParam,
  clearFilters,
}: PlpFilterModalProps) {
  const selectedColors = asArray(filters.color)
  const selectedMaterials = asArray(filters.material)

  return (
    <Modal open={open} onClose={onClose} title="Filtros y orden">
      <div className="space-y-6 p-5">
        {/* Orden (radios) */}
        <fieldset>
          <legend className="sr-only">Ordenar por</legend>
          <div className="grid gap-x-8 sm:grid-cols-2">
            {sortOptions.map((option) => (
              <Radio
                key={option.id}
                name="plp-sort"
                label={option.label}
                checked={(filters.sort ?? 'recommended') === option.id}
                onChange={() => setParam({ sort: option.id })}
              />
            ))}
          </div>
        </fieldset>

        {/* Facetas (acordeones) */}
        <Accordion
          items={[
            {
              id: 'category',
              label: 'tipo de producto',
              content: (
                <div>
                  {categories.map((c) => (
                    <Radio
                      key={c.id}
                      name="plp-category"
                      label={c.name}
                      checked={filters.category === c.id}
                      onChange={() =>
                        setParam({
                          category: filters.category === c.id ? undefined : c.id,
                        })
                      }
                    />
                  ))}
                </div>
              ),
            },
            {
              id: 'collection',
              label: 'colección',
              content: (
                <div>
                  {collections.map((c) => (
                    <Radio
                      key={c.id}
                      name="plp-collection"
                      label={c.name}
                      checked={filters.collection === c.id}
                      onChange={() =>
                        setParam({
                          collection: filters.collection === c.id ? undefined : c.id,
                        })
                      }
                    />
                  ))}
                </div>
              ),
            },
            {
              id: 'color',
              label: 'color',
              content: (
                <div>
                  {facets.colors.map((color) => (
                    <Checkbox
                      key={color}
                      label={color}
                      checked={selectedColors.includes(color)}
                      onChange={() => toggleArrayParam('color', color)}
                    />
                  ))}
                </div>
              ),
            },
            {
              id: 'material',
              label: 'material',
              content: (
                <div>
                  {facets.materials.map((material) => (
                    <Checkbox
                      key={material}
                      label={material}
                      checked={selectedMaterials.includes(material)}
                      onChange={() => toggleArrayParam('material', material)}
                    />
                  ))}
                </div>
              ),
            },
            {
              id: 'price',
              label: 'precio',
              content: (
                <div>
                  {priceRanges.map((range) => {
                    const active =
                      filters.priceMin === range.priceMin &&
                      filters.priceMax === range.priceMax
                    return (
                      <Radio
                        key={range.label}
                        name="plp-price"
                        label={range.label}
                        checked={active}
                        onChange={() =>
                          setParam({
                            priceMin: active ? undefined : range.priceMin,
                            priceMax: active ? undefined : range.priceMax,
                          })
                        }
                      />
                    )
                  })}
                </div>
              ),
            },
          ]}
        />
      </div>

      {/* Pie (§2.9) */}
      <div className="flex shrink-0 gap-3 border-t border-line p-5">
        <Button
          variant="secondary"
          className="flex-1"
          disabled={activeFilterCount === 0}
          onClick={clearFilters}
        >
          Borrar todo
        </Button>
        <Button className="flex-1" onClick={onClose}>
          Mostrar {resultCount} {resultCount === 1 ? 'resultado' : 'resultados'}
        </Button>
      </div>
    </Modal>
  )
}
