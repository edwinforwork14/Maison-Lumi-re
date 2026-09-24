import { createFileRoute, Link } from '@tanstack/react-router'
import { listProducts, listCategories, listCollections } from '@/features/commerce.api'
import { ProductGrid } from '@/components/product/ProductGrid'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { ButtonLink } from '@/components/ui/Button'

export const Route = createFileRoute('/')({
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
    const [all, categories, collections] = await Promise.all([
      listProducts(),
      listCategories(),
      listCollections(),
    ])
    const featured = all.filter((p) => p.featured).slice(0, 8)
    const arrivals = [...all].sort((a, b) => Number(b.isNew) - Number(a.isNew)).slice(0, 4)
    return { featured, arrivals, categories, collections }
  },
})

function Home() {
  const { featured, arrivals, categories, collections } = Route.useLoaderData()

  return (
    <div className="animate-fade-in">
      {/* ─── Hero ─── */}
      <section className="relative h-[80vh] min-h-[540px] overflow-hidden bg-linen">
        <img
          src="https://picsum.photos/seed/maison-hero/2000/1200"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/40 via-transparent to-transparent" />
        <div className="relative flex h-full flex-col items-start justify-end px-6 pb-20 md:px-16 md:pb-28">
          <p className="mb-4 text-[11px] uppercase tracking-[0.35em] text-ivory/80">
            Colección Lumière · Otoño 2026
          </p>
          <h1 className="mb-8 max-w-xl font-serif text-4xl font-light leading-tight text-ivory md:text-6xl">
            La luz de las cosas bien hechas
          </h1>
          <ButtonLink to="/shop" size="lg">
            Descubrir la colección
          </ButtonLink>
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
              <div className="mb-4 overflow-hidden bg-sand">
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
      <section className="bg-charcoal text-ivory">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 md:grid-cols-2 md:px-8 md:py-28">
          <div>
            <p className="mb-4 text-[11px] uppercase tracking-[0.3em] text-clay">
              El atelier
            </p>
            <h2 className="mb-6 font-serif text-3xl font-light leading-snug md:text-5xl">
              Cada pieza pasa por ochenta manos antes de la suya
            </h2>
            <p className="mb-10 max-w-md text-sm leading-relaxed text-ivory/70">
              Trabajamos con talleres familiares de Francia, Italia y España.
              Acetatos pulidos a mano, cueros de curtido vegetal y metal bañado
              en oro fino. Producción limitada, sin temporadas descartables.
            </p>
            <ButtonLink
              variant="outline"
              to="/shop"
              search={{ collection: 'atelier' }}
              className="border-ivory text-ivory hover:bg-ivory hover:text-ink"
            >
              Conocer Atelier
            </ButtonLink>
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
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-ink/25 text-center text-ivory transition-colors group-hover:bg-ink/40">
                <p className="font-serif text-3xl font-light">{c.name}</p>
                <p className="mt-2 max-w-52 px-4 text-xs text-ivory/80">
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
