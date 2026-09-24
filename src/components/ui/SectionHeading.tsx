interface SectionHeadingProps {
  eyebrow?: string
  title: string
  action?: { label: string; to: string }
}

export function SectionHeading({ eyebrow, title, action }: SectionHeadingProps) {
  return (
    <div className="mb-10 flex items-end justify-between gap-6">
      <div>
        {eyebrow && (
          <p className="mb-2 text-[11px] uppercase tracking-[0.3em] text-taupe">
            {eyebrow}
          </p>
        )}
        <h2 className="font-serif text-3xl font-light md:text-4xl">{title}</h2>
      </div>
      {action && (
        <a
          href={action.to}
          className="hidden shrink-0 text-[11px] uppercase tracking-[0.2em] underline-offset-4 hover:underline md:block"
        >
          {action.label} →
        </a>
      )}
    </div>
  )
}
