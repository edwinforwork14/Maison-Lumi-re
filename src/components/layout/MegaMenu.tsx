import { Link } from '@tanstack/react-router'
import { categories, collections } from '@/data'

export interface NavSection {
  label: string
  to: string
  sections: {
    title: string
    links: { label: string; to: string }[]
  }[]
  highlight?: { title: string; text: string; to: string; cta: string }
}

export const navSections: NavSection[] = [
  {
    label: 'Novedades',
    to: '/shop',
    sections: [
      {
        title: 'Descubrir',
        links: [
          { label: 'Todo el catálogo', to: '/shop' },
          { label: 'Nuevos ingresos', to: '/shop?sort=new' },
          { label: 'Bestsellers', to: '/shop?sort=bestsellers' },
        ],
      },
      {
        title: 'Colecciones',
        links: collections.map((c) => ({
          label: c.name,
          to: `/shop?collection=${c.id}`,
        })),
      },
    ],
    highlight: {
      title: 'Lumière',
      text: 'Luz dorada y metal pulido para la nueva temporada.',
      to: '/shop?collection=lumiere',
      cta: 'Descubrir',
    },
  },
  ...categories.map((cat) => ({
    label: cat.name,
    to: `/shop?category=${cat.id}`,
    sections: [
      {
        title: cat.name,
        links: [
          { label: `Todo ${cat.name.toLowerCase()}`, to: `/shop?category=${cat.id}` },
          ...collections.map((c) => ({
            label: c.name,
            to: `/shop?category=${cat.id}&collection=${c.id}`,
          })),
        ],
      },
      {
        title: 'Por material',
        links:
          cat.id === 'eyewear'
            ? [
                { label: 'Acetato', to: '/shop?category=eyewear&material=Acetato' },
                { label: 'Metal', to: '/shop?category=eyewear&material=Metal' },
              ]
            : cat.id === 'accessories'
              ? [
                  { label: 'Seda', to: '/shop?category=accessories&material=Tela' },
                  { label: 'Cuero', to: '/shop?category=accessories&material=Cuero' },
                ]
              : [{ label: 'Cuero', to: `/shop?category=${cat.id}&material=Cuero` }],
      },
    ],
    highlight: {
      title: cat.name,
      text: cat.editorial,
      to: `/shop?category=${cat.id}`,
      cta: 'Ver colección',
    },
  })),
]

/**
 * Panel del mega menú (plan.md D1): visible por hover y por foco gracias a
 * la variante group-nav + focus-within; operable solo con teclado.
 */
export function MegaMenu({ section }: { section: NavSection }) {
  return (
    <div
      className="absolute inset-x-0 top-full hidden border-b border-linen bg-ivory shadow-[0_20px_40px_-20px_rgba(26,24,21,0.15)] group-nav:block animate-fade-in"
      aria-label={`Sección ${section.label}`}
    >
      <div className="mx-auto grid max-w-7xl grid-cols-12 gap-10 px-8 py-12">
        {section.sections.map((s) => (
          <div key={s.title} className="col-span-3">
            <p className="eyebrow mb-4">{s.title}</p>
            <ul className="space-y-3">
              {s.links.map((l) => (
                <li key={l.label}>
                  <Link
                    to={l.to}
                    className="text-sm text-charcoal transition-colors hover:text-taupe"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {section.highlight && (
          <Link
            to={section.highlight.to}
            className="group-hl col-span-4 col-start-9 block"
          >
            <div className="bg-sand p-8 transition-colors group-hover:bg-linen">
              <p className="mb-2 font-serif text-2xl font-light">
                {section.highlight.title}
              </p>
              <p className="mb-6 text-sm text-taupe">{section.highlight.text}</p>
              <span className="text-[11px] uppercase tracking-[0.2em] underline underline-offset-4">
                {section.highlight.cta} →
              </span>
            </div>
          </Link>
        )}
      </div>
    </div>
  )
}
