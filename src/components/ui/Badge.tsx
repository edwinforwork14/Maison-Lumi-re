const styles: Record<string, string> = {
  new: 'bg-ink text-ivory',
  bestseller: 'bg-clay text-white',
  sale: 'bg-gold text-white',
  out: 'bg-sand text-taupe border border-linen',
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
      className={`inline-block px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${styles[kind]}`}
    >
      {children}
    </span>
  )
}
