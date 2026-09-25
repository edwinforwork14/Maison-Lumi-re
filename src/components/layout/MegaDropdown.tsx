/**
 * Mega dropdown multinivel bajo el botón «Menú» (brief §1–§5).
 *
 * Tres columnas: secciones → enlaces de la sección activa → productos reales.
 * El panel es hijo del `<header>` (`absolute inset-x-0 top-full`), así que no
 * hay hueco real entre botón y panel: el recorrido por el padding del header
 * lo cubre la tolerancia de cierre de `useMegaMenu` (§19). Sólo existe en
 * desktop con puntero fino; en táctil la navegación sigue siendo el modal
 * (§13). Al cerrar queda `inert`, así que el Tab nunca lo alcanza por
 * accidente; el teclado tiene el modal fullscreen como recorrido completo.
 */

import { Link } from '@tanstack/react-router'
import { Icon } from '@/components/ui/Icon'
import { cn } from '@/lib/cn'
import { buildNavSections, type NavCategory, type NavCollection } from './MegaMenu'
import { MegaDropdownProducts } from './MegaDropdownProducts'
import type { MegaMenuApi } from './use-mega-menu'

export interface MegaDropdownProps {
  readonly categories: readonly NavCategory[]
  readonly collections: readonly NavCollection[]
  readonly menu: MegaMenuApi
}

export function MegaDropdown({
  categories,
  collections,
  menu,
}: MegaDropdownProps) {
  const { state, canHover, open, scheduleClose, hoverSection, hoverLink, close } =
    menu
  if (!canHover) return null

  const sections = buildNavSections(categories, collections)
  const section = sections[state.activeSection] ?? sections[0]!
  const filters = state.activeFilters ?? section.filters ?? {}

  const panelCls = state.isOpen
    ? 'opacity-100 translate-y-0 pointer-events-auto'
    : 'opacity-0 -translate-y-2 pointer-events-none'

  return (
    <div
      role="navigation"
      aria-label={`Menú de ${section.label}`}
      aria-hidden={!state.isOpen}
      inert={!state.isOpen}
      onMouseEnter={open}
      onMouseLeave={scheduleClose}
      className={cn(
        'absolute inset-x-0 top-full z-40 border-b border-line bg-surface',
        'transition-[opacity,transform] duration-200 ease-[cubic-bezier(.23,1,.32,1)]',
        panelCls,
      )}
    >
      <div className="mx-auto grid max-w-7xl gap-x-12 gap-y-10 px-5 py-9 md:px-10 lg:grid-cols-[200px_minmax(0,1fr)_400px]">
        {/* Columna 1 — secciones (§3) */}
        <nav aria-label="Categorías">
          <p className="label-wide mb-5 text-text-secondary">Categorías</p>
          <ul className="space-y-1">
            {sections.map((s, i) => (
              <li key={s.label}>
                <Link
                  to={s.to}
                  onMouseEnter={() => hoverSection(i)}
                  onClick={close}
                  className={cn(
                    'flex items-center justify-between gap-3 py-2 text-[13px] transition-all duration-200',
                    i === state.activeSection
                      ? 'font-medium text-strong'
                      : 'text-text-primary hover:translate-x-1 hover:text-text-secondary',
                  )}
                >
                  {s.label}
                  <Icon
                    name="chevron-right"
                    size={14}
                    className={cn(
                      'transition-opacity duration-200',
                      i === state.activeSection
                        ? 'opacity-100'
                        : 'opacity-0',
                    )}
                  />
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Columna 2 — enlaces de la sección activa; `key` re-dispara la
            animación lateral al cambiar de categoría (§3/§11) */}
        <div key={section.label} className="animate-mega-in">
          <p className="label-wide mb-5 text-text-secondary">{section.label}</p>
          <div className="grid gap-x-10 gap-y-7 sm:grid-cols-2">
            {section.sections.map((group) => (
              <div key={group.title}>
                <p className="label mb-3 text-text-secondary">{group.title}</p>
                <ul>
                  {group.links.map((link) => (
                    <li key={`${group.title}-${link.label}`}>
                      <Link
                        to={link.to}
                        onMouseEnter={() => hoverLink(link.filters ?? {})}
                        onClick={close}
                        className="block py-1.5 text-[13px] transition-colors hover:text-text-secondary"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* «Ver todo» de la sección (§10) */}
          <Link
            to={section.to}
            onClick={close}
            className="mt-8 inline-flex items-center gap-2 text-[13px] underline underline-offset-4 transition-colors hover:text-text-secondary"
          >
            Ver todo {section.label}
            <Icon name="arrow-right" size={14} />
          </Link>
        </div>

        {/* Columna 3 — productos reales (§4/§12) */}
        <MegaDropdownProducts
          key={JSON.stringify(filters)}
          filters={filters}
          open={state.isOpen}
          onClose={close}
          className="hidden lg:block"
        />
      </div>
    </div>
  )
}
