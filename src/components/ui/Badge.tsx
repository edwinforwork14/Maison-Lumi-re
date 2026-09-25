const styles: Record<string, string> = {
  // Etiquetas de tarjeta de la referencia: mínimas, 10 px, mayúsculas,
  // sin fondos de color saturado (Plan 04 §2.7).
  new: 'border border-strong text-text-primary bg-surface',
  bestseller: 'border border-line-medium text-text-secondary bg-surface',
  sale: 'border border-strong text-strong bg-surface',
  out: 'border border-line text-text-secondary bg-subtle',
}

export function Badge({
  kind,
  children,
}: {
  kind: keyof typeof styles
  children: string
}) {
  return (
    <span
      className={`inline-block px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${styles[kind]}`}
    >
      {children}
    </span>
  )
}
