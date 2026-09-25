import { Link, type LinkComponentProps } from '@tanstack/react-router'
import { Icon } from './Icon'

export interface Crumb {
  readonly label: string
  /** Sin `linkProps` la miga es el nodo actual (no es enlace). */
  readonly linkProps?: Omit<LinkComponentProps<'a'>, 'className' | 'children'>
}

/**
 * Migas de pan de la referencia (Plan 04 §2.14): `flex wrap`, `gap: 4px`,
 * 13 px, sin bordes ni fondo. En la referencia van al FINAL de la página;
 * la posición la decide la ruta que los renderiza.
 */
export function Breadcrumb({ items }: { items: readonly Crumb[] }) {
  if (items.length === 0) return null
  return (
    <nav aria-label="Migas de pan">
      <ul className="flex flex-wrap items-center gap-1 text-[13px] text-text-secondary">
        {items.map((crumb, index) => {
          const isLast = index === items.length - 1
          return (
            <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
              {crumb.linkProps ? (
                <Link
                  {...crumb.linkProps}
                  className="text-text-secondary transition-colors hover:text-strong"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current="page" className="text-text-primary">
                  {crumb.label}
                </span>
              )}
              {!isLast && <Icon name="chevron-right" size={12} className="text-line-medium" />}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
