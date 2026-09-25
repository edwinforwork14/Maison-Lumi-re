import { Link, type LinkProps } from '@tanstack/react-router'

interface EmptyStateProps {
  title: string
  message: string
  /** Acción: enlace tipado (corrige D8) o botón con `onClick` (reintentar). */
  action?: { label: string; linkProps: LinkProps } | { label: string; onClick: () => void }
}

function isLink(
  action: NonNullable<EmptyStateProps['action']>,
): action is { label: string; linkProps: LinkProps } {
  return 'linkProps' in action
}

/** Estado vacío con la tipografía de la referencia: sin serif, cuerpo 13 px. */
export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <p className="mb-3 text-[1.0625rem] font-medium uppercase tracking-[-0.03em]">{title}</p>
      <p className="body-text mb-8 max-w-sm text-text-secondary">{message}</p>
      {action &&
        (isLink(action) ? (
          <Link {...action.linkProps} className="btn btn-outline label">
            {action.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            className="btn btn-outline label"
          >
            {action.label}
          </button>
        ))}
    </div>
  )
}
