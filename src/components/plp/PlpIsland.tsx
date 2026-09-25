import { Icon } from '@/components/ui/Icon'
import { useHideOnScroll } from '@/hooks/use-hide-on-scroll'

/**
 * Isla flotante de la PLP (Plan 04 §2.6): dos botones frost fijos abajo y
 * centrados —selector de categoría con chevron (abre el modal de
 * subcategorías) y «Filtrar» (abre «Filtros y orden»)—. Se oculta al bajar
 * el scroll y reaparece al subir. En móvil el botón de filtrar es sólo icono.
 */
export function PlpIsland({
  categoryLabel,
  filterCount,
  onOpenCategories,
  onOpenFilters,
}: {
  readonly categoryLabel: string
  readonly filterCount: number
  readonly onOpenCategories: () => void
  readonly onOpenFilters: () => void
}) {
  const visible = useHideOnScroll()

  return (
    <div
      className={`fixed inset-x-5 bottom-0 z-40 flex justify-center gap-2 pb-6 transition-transform duration-150 ${
        visible ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      <h2 className="sr-only">Filtros de la página de listado</h2>
      <button
        type="button"
        onClick={onOpenCategories}
        className="btn btn-frost body-text normal-case tracking-normal"
      >
        {categoryLabel}
        <Icon name="chevron-down" size={16} />
      </button>
      <button
        type="button"
        onClick={onOpenFilters}
        aria-label={filterCount > 0 ? `Filtrar y ordenar (${filterCount})` : 'Filtrar y ordenar'}
        className="btn btn-frost body-text normal-case tracking-normal"
      >
        <Icon name="filter" size={16} />
        <span className="max-md:hidden">
          Filtrar{filterCount > 0 ? ` (${filterCount})` : ''}
        </span>
      </button>
    </div>
  )
}
