import { Link, type LinkProps } from '@tanstack/react-router'

interface EmptyStateProps {
  title: string
  message: string
  /** Enlace tipado (corrige D8: era <a href> sin verificación). */
  action?: { label: string; linkProps: LinkProps }
}

export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <p className="mb-3 font-serif text-2xl font-light">{title}</p>
      <p className="mb-8 max-w-sm text-sm text-taupe">{message}</p>
      {action && (
        <Link
          {...action.linkProps}
          className="border border-ink px-8 py-3 text-[11px] uppercase tracking-[0.2em] transition-colors hover:bg-ink hover:text-ivory"
        >
          {action.label}
        </Link>
      )}
    </div>
  )
}
