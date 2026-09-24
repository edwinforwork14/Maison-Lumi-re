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

export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <p className="mb-3 font-serif text-2xl font-light">{title}</p>
      <p className="mb-8 max-w-sm text-sm text-taupe">{message}</p>
      {action &&
        (isLink(action) ? (
          <Link {...action.linkProps} className="btn btn-outline px-8 py-3 label">
            {action.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            className="btn btn-outline px-8 py-3 label"
          >
            {action.label}
          </button>
        ))}
    </div>
  )
}
