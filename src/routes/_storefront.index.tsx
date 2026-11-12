import { createFileRoute, Link } from '@tanstack/react-router'
import { listProducts, listCategories, listCollections, getHomepage } from '@/features/commerce.api'
import { ProductGrid } from '@/components/product/ProductGrid'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { ButtonAnchor } from '@/components/ui/Button'

export const Route = createFileRoute('/_storefront/')({
  component: Home,
  head: () => ({
    meta: [
      { title: 'Maison Lumière — Nueva temporada' },
      {
        name: 'description',
        content:
          'Descubra la nueva colección: gafas, bolsos y accesorios hechos a mano.',
      },
    ],
  }),
  // Datos en servidor (plan.md A2): la home ya no importa mocks.
  loader: async () => {
    const [all, categories, collections, homepage] = await Promise.all([
      listProducts(),
      listCategories(),
      listCollections(),
      getHomepage(),
    ])
    const featured = all.filter((p) => p.featured).slice(0, 8)
    const arrivals = [...all].sort((a, b) => Number(b.isNew) - Number(a.isNew)).slice(0, 4)
    return { featured, arrivals, categories, collections, homepage }
  },
})

/**
 * Portada editable desde BD (Plan 03 S4). Cada bloque tiene sus textos por
 * defecto: si el panel no ha publicado nada, la home se ve como siempre.
 */
const HOME_COPY = {
  hero: {
    eyebrow: 'Colección Lumière · Otoño 2026',
    title: 'La luz de las cosas bien hechas',
    ctaLabel: 'Descubrir la colección',
    ctaHref: '/shop',
  },
  atelier: {
    title: 'Cada pieza pasa por ochenta manos antes de la suya',
    body: 'Trabajamos con talleres familiares de Francia, Italia y España. Acetatos pulidos a mano, cueros de curtido vegetal y metal bañado en oro fino. Producción limitada, sin temporadas descartables.',
    ctaLabel: 'Conocer Atelier',
    ctaHref: '/shop?collection=atelier',
  },
} as const

type BlockKey = keyof typeof HOME_COPY

function blockOf(
  blocks: readonly { key: string; title: string | null; subtitle: string | null; ctaLabel: string | null; ctaHref: string | null }[],
  key: BlockKey,
) {
  return blocks.find((block) => block.key === key)
}

function Home() {
  const { featured, arrivals, categories, collections, homepage } = Route.useLoaderData()

  const heroBlock = blockOf(homepage.blocks, 'hero')
  const hero = {
    eyebrow: heroBlock?.subtitle ?? HOME_COPY.hero.eyebrow,
    title: heroBlock?.title ?? HOME_COPY.hero.title,
    ctaLabel: heroBlock?.ctaLabel ?? HOME_COPY.hero.ctaLabel,
    ctaHref: heroBlock?.ctaHref ?? HOME_COPY.hero.ctaHref,
  }
  const atelierBlock = blockOf(homepage.blocks, 'atelier')
  const atelier = {
    title: atelierBlock?.title ?? HOME_COPY.atelier.title,
    body: atelierBlock?.subtitle ?? HOME_COPY.atelier.body,
    ctaLabel: atelierBlock?.ctaLabel ?? HOME_COPY.atelier.ctaLabel,
    ctaHref: atelierBlock?.ctaHref ?? HOME_COPY.atelier.ctaHref,
  }

  return (
    <div className="animate-fade-in">
      {/* ─── Hero: banner a sangre 4/5 → 16/9 con contenido superpuesto (U12) ───
              Plan 05 §3.4: `-mt-[var(--chrome-h)]` mete el hero bajo la cabecera
              (que lo pinta encima por `z-40`) para el bleed; el degradado CLARO
              superior mantiene legible el texto oscuro de la cabecera. El
              contenido del hero sigue anclado abajo, así que nada queda oculto. */}
        <div className="relative -mt-[var(--chrome-h)] overflow-hidden bg-subtle">
          <picture>
            <source media="(min-width: 1024px)" srcSet="https://picsum.photos/seed/maison-hero/2000/1125" />
            <img
              src="https://picsum.photos/seed/maison-hero/1200/1500"
              alt=""
              className="aspect-square md:aspect-[4/5] lg:aspect-video w-full object-cover"
            />
          </picture>
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-surface/85 via-surface/30 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-strong/50 via-transparent to-transparent" />
        <div className="absolute inset-x-0 bottom-0 px-6 pb-12 md:px-16 md:pb-16">
          <p className="mb-3 label-wide tracking-[0.35em] text-surface/80">
            {hero.eyebrow}
          </p>
          <h1 className="mb-6 max-w-xl text-[1.4375rem] font-medium uppercase leading-none tracking-[-0.03em] text-surface md:text-[1.9375rem]">
            {hero.title}
          </h1>
          <ButtonAnchor href={hero.ctaHref} size="lg">
            {hero.ctaLabel}
          </ButtonAnchor>
        </div>
      </section>

      {/* ─── Categorías ─── */}
      <section className="mx-auto max-w-7xl px-4 py-20 md:px-8 md:py-28">
        <SectionHeading
          eyebrow="Universos"
          title="Explorar por categoría"
          action={{ label: 'Ver todo', linkProps: { to: '/shop' } }}
        />
        <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          {categories.map((c, i) => (
            <Link
              key={c.id}
              to="/shop"
              search={{ category: c.id }}
              className="group block"
            >
              <div className="mb-4 overflow-hidden bg-subtle">
                <img
                  src={`https://picsum.photos/seed/ml-cat-${c.id}/700/900`}
                  alt={c.name}
                  loading="lazy"
                  className={`aspect-3/4 w-full object-cover transition-transform duration-700 group-hover:scale-105 ${
                    i % 2 === 1 ? 'lg:translate-y-8' : ''
                  }`}
                />
              </div>
              <p className="text-sm uppercase tracking-[0.2em]">{c.name}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ─── Destacados ─── */}
      <section className="mx-auto max-w-7xl px-4 pb-20 md:px-8 md:pb-28">
        <SectionHeading
          eyebrow="Selección"
          title="Piezas destacadas"
          action={{ label: 'Ver catálogo', linkProps: { to: '/shop' } }}
        />
        <ProductGrid products={featured} />
      </section>

      {/* ─── Editorial ─── */}
      <section className="bg-strong text-surface">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 md:grid-cols-2 md:px-8 md:py-28">
          <div>
            <p className="mb-4 label-wide tracking-[0.3em] text-surface/70">
              El atelier
            </p>
            <h2 className="mb-6 editorial-title leading-snug">
              {atelier.title}
            </h2>
            <p className="body-text mb-10 max-w-md leading-relaxed text-surface/70">
              {atelier.body}
            </p>
            <ButtonAnchor
              href={atelier.ctaHref}
              variant="outline"
              className="border-surface text-surface hover:bg-surface hover:text-strong"
            >
              {atelier.ctaLabel}
            </ButtonAnchor>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <img
              src="https://picsum.photos/seed/ml-atelier-1/700/900"
              alt="Detalle de atelier"
              loading="lazy"
              className="aspect-3/4 w-full object-cover"
            />
            <img
              src="https://picsum.photos/seed/ml-atelier-2/700/900"
              alt="Materiales"
              loading="lazy"
              className="mt-10 aspect-3/4 w-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* ─── Colecciones ─── */}
      <section className="mx-auto max-w-7xl px-4 py-20 md:px-8 md:py-28">
        <SectionHeading eyebrow="Colecciones" title="Tres mundos" />
        <div className="grid gap-6 md:grid-cols-3">
          {collections.map((c) => (
            <Link
              key={c.id}
              to="/shop"
              search={{ collection: c.id }}
              className="group relative block overflow-hidden"
            >
              <img
                src={`https://picsum.photos/seed/ml-col-${c.id}/800/1000`}
                alt={c.name}
                loading="lazy"
                className="aspect-4/5 w-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-strong/25 text-center text-surface transition-colors group-hover:bg-strong/40">
                <p className="editorial-title">{c.name}</p>
                <p className="mt-2 max-w-52 px-4 text-xs text-surface/80">
                  {c.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ─── Nuevos ingresos ─── */}
      <section className="mx-auto max-w-7xl px-4 pb-24 md:px-8 md:pb-32">
        <SectionHeading
          eyebrow="Recién llegados"
          title="Novedades"
          action={{ label: 'Ver todas', linkProps: { to: '/shop', search: { sort: 'new' } } }}
        />
        <ProductGrid products={arrivals} />
      </section>
    </div>
  )
}
