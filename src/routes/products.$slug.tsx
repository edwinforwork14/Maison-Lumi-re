import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  createFileRoute,
  Link,
  notFound,
} from '@tanstack/react-router'
import { getProductBySlug, listRelatedProducts, listCategories } from '@/features/commerce.api'
import type { Product } from '@/data/types'
import { formatPrice } from '@/lib/format'
import { useStore } from '@/lib/store'
import { QuantitySelector } from '@/components/ui/QuantitySelector'
import { ProductGrid } from '@/components/product/ProductGrid'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { Badge } from '@/components/ui/Badge'

export const Route = createFileRoute('/products/$slug')({
  loader: async ({ params }) => {
    const [product, categories] = await Promise.all([
      getProductBySlug({ data: { slug: params.slug } }),
      listCategories(),
    ])
    if (!product) throw notFound()
    return { product, categories }
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.product.name} — Maison Lumière` : 'Producto' },
      { name: 'description', content: loaderData?.product.description ?? '' },
      { property: 'og:title', content: loaderData?.product.name ?? '' },
      { property: 'og:description', content: loaderData?.product.description ?? '' },
    ],
  }),
  pendingComponent: ProductSkeleton,
  component: ProductDetail,
})

function ProductSkeleton() {
  return (
    <div className="mx-auto grid max-w-7xl gap-12 px-4 py-14 md:px-8 lg:grid-cols-2">
      <div className="skeleton aspect-3/4 w-full" />
      <div className="space-y-6">
        <div className="skeleton h-4 w-40" />
        <div className="skeleton h-10 w-72" />
        <div className="skeleton h-6 w-32" />
        <div className="skeleton h-24 w-full max-w-md" />
        <div className="skeleton h-14 w-full" />
      </div>
    </div>
  )
}

function ProductDetail() {
  const { product, categories } = Route.useLoaderData()
  const { addToCart, toggleWishlist, isWishlisted } = useStore()
  const [color, setColor] = useState(product.colors[0] ?? '')
  const [quantity, setQuantity] = useState(1)
  const [imageIndex, setImageIndex] = useState(0)

  // Stock por variante (defecto D14): la talla/color elegido manda.
  const variant = product.variants.find((v) => v.color === color)
  const variantStock = variant?.stock ?? 0
  const soldOut = variantStock === 0
  const wishlisted = isWishlisted(product.id)
  const category = categories.find((c) => c.id === product.category)

  return (
    <div className="animate-fade-in">
      {/* Breadcrumb */}
      <nav
        className="mx-auto max-w-7xl px-4 py-6 text-[11px] uppercase tracking-[0.2em] text-taupe md:px-8"
        aria-label="Miga de pan"
      >
        <Link to="/" className="hover:text-ink">Inicio</Link>
        <span className="mx-2">/</span>
        <Link to="/shop" className="hover:text-ink">Tienda</Link>
        <span className="mx-2">/</span>
        <span className="text-ink">{product.name}</span>
      </nav>

      <div className="mx-auto grid max-w-7xl gap-12 px-4 pb-24 md:px-8 lg:grid-cols-2">
        {/* Galería */}
        <div className="flex gap-4">
          <div className="hidden w-20 shrink-0 flex-col gap-3 md:flex">
            {product.images.map((src, i) => (
              <button
                key={src}
                type="button"
                onClick={() => setImageIndex(i)}
                className={`overflow-hidden border transition-colors ${
                  imageIndex === i ? 'border-ink' : 'border-transparent'
                }`}
                aria-label={`Ver imagen ${i + 1}`}
              >
                <img src={src} alt="" className="aspect-3/4 w-full object-cover" />
              </button>
            ))}
          </div>
          <div className="flex-1 bg-sand">
            <img
              src={product.images[imageIndex]}
              alt={product.name}
              className="aspect-3/4 w-full object-cover animate-fade-in"
            />
            {/* Thumbnails mobile */}
            <div className="flex gap-2 p-3 md:hidden">
              {product.images.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setImageIndex(i)}
                  className={`flex-1 overflow-hidden border ${
                    imageIndex === i ? 'border-ink' : 'border-transparent'
                  }`}
                  aria-label={`Ver imagen ${i + 1}`}
                >
                  <img src={src} alt="" className="aspect-square w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Información */}
        <div className="lg:sticky lg:top-32 lg:self-start">
          <p className="eyebrow mb-2">
            {category?.name} · {product.collection}
          </p>
          <h1 className="mb-4 font-serif text-3xl font-light md:text-4xl">
            {product.name}
          </h1>

          <p className="mb-6 flex items-baseline gap-3">
            <span className={`text-lg ${product.compareAtPrice ? 'text-gold' : ''}`}>
              {formatPrice(product.price)}
            </span>
            {product.compareAtPrice && (
              <span className="text-sm text-clay line-through">
                {formatPrice(product.compareAtPrice)}
              </span>
            )}
          </p>

          <p className="mb-8 max-w-md text-sm leading-relaxed text-taupe">
            {product.description}
          </p>

          {/* Color — cada opción muestra su disponibilidad real */}
          <div className="mb-8">
            <p className="eyebrow mb-3">
              Color: <span className="text-ink">{color}</span>
            </p>
            <div className="flex flex-wrap gap-3">
              {product.variants.map((v) => (
                <button
                  key={v.sku}
                  type="button"
                  onClick={() => {
                    setColor(v.color)
                    setQuantity(1)
                  }}
                  disabled={v.stock === 0}
                  className={`border px-5 py-2.5 text-xs uppercase tracking-[0.15em] transition-colors disabled:cursor-not-allowed disabled:text-clay disabled:line-through ${
                    color === v.color
                      ? 'border-ink bg-ink text-ivory'
                      : 'border-linen hover:border-clay'
                  }`}
                  aria-pressed={color === v.color}
                >
                  {v.color}
                  {v.stock === 0 ? ' · agotado' : ''}
                </button>
              ))}
            </div>
          </div>

          {/* Cantidad + carrito */}
          <div className="mb-4 flex flex-wrap items-center gap-4">
            <QuantitySelector
              value={quantity}
              onChange={setQuantity}
              max={Math.max(1, Math.min(10, variantStock))}
            />
            <span className="text-xs text-taupe" role="status">
              {soldOut
                ? 'Agotado'
                : variantStock < 10
                  ? `Solo quedan ${variantStock} unidades`
                  : 'En stock'}
            </span>
          </div>

          <button
            type="button"
            disabled={soldOut}
            onClick={() => addToCart(product as Product, color, quantity)}
            className="mb-4 w-full bg-ink py-4 text-[11px] uppercase tracking-[0.25em] text-ivory transition-colors hover:bg-charcoal disabled:cursor-not-allowed disabled:bg-clay"
          >
            {soldOut ? 'Agotado' : 'Añadir al carrito'}
          </button>

          <button
            type="button"
            onClick={() => toggleWishlist(product.id)}
            className="mb-10 w-full border border-ink py-4 text-[11px] uppercase tracking-[0.25em] transition-colors hover:bg-sand"
          >
            {wishlisted ? '♥ En wishlist' : '♡ Añadir a wishlist'}
          </button>

          {/* Detalles */}
          <div className="space-y-4 border-t border-linen pt-8 text-sm">
            <details className="group">
              <summary className="eyebrow cursor-pointer list-none marker:hidden">
                Detalles del producto
              </summary>
              <ul className="mt-3 space-y-1.5 text-taupe">
                <li>· Materiales: {product.materials.join(', ')}</li>
                <li>· Colores disponibles: {product.colors.join(', ')}</li>
                <li>· Ref. {product.id.toUpperCase()}</li>
              </ul>
            </details>
            <details className="group">
              <summary className="eyebrow cursor-pointer list-none">
                Envío y devoluciones
              </summary>
              <p className="mt-3 text-taupe">
                Envío estándar 3–5 días (gratuito a partir de 500 €). Express
                24–48 h. Devoluciones gratuitas durante 30 días.
              </p>
            </details>
          </div>
        </div>
      </div>

      {/* Relacionados */}
      {product.id && <RelatedSection slug={product.slug} />}
    </div>
  )
}

function RelatedSection({ slug }: { slug: string }) {
  const { data: related = [] } = useRelatedProducts(slug)
  if (related.length === 0) return null
  return (
    <section className="mx-auto max-w-7xl px-4 pb-24 md:px-8">
      <SectionHeading eyebrow="También le puede gustar" title="Relacionados" />
      <ProductGrid products={related} />
    </section>
  )
}

function useRelatedProducts(slug: string) {
  return useQuery({
    queryKey: ['related', slug],
    queryFn: () => listRelatedProducts({ data: { slug } }),
  })
}
