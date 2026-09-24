interface EmptyStateProps {
  title: string
  message: string
  action?: { label: string; to: string }
}

export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <p className="mb-3 font-serif text-2xl font-light">{title}</p>
      <p className="mb-8 max-w-sm text-sm text-taupe">{message}</p>
      {action && (
        <a
          href={action.to}
          className="border border-ink px-8 py-3 text-[11px] uppercase tracking-[0.2em] transition-colors hover:bg-ink hover:text-ivory"
        >
          {action.label}
        </a>
      )}
    </div>
  )
}
