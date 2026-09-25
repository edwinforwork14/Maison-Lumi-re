import { Link, type LinkProps } from '@tanstack/react-router'

interface SectionHeadingProps {
  eyebrow?: string
  title: string
  /** Enlace tipado (corrige D8: era <a href> sin verificación). */
  action?: { label: string; linkProps: LinkProps }
}

/**
 * Encabezado de sección con el lenguaje editorial de la referencia:
 * sin serif, mayúsculas y tracking negativo (Plan 04 §1.1, `editorial-title`).
 */
export function SectionHeading({ eyebrow, title, action }: SectionHeadingProps) {
  return (
    <div className="mb-10 flex items-end justify-between gap-6">
      <div>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h2 className="editorial-title">{title}</h2>
      </div>
      {action && (
        <Link
          {...action.linkProps}
          className="hidden shrink-0 text-[13px] underline-offset-4 hover:underline md:block"
        >
          {action.label} →
        </Link>
      )}
    </div>
  )
}
