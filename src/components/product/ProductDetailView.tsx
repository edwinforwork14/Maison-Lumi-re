import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSiteSettings } from '@/features/commerce.api'
import { queryKeys } from '@/features/model/queries'
import type { getProductBySlug } from '@/features/commerce.api'
import type { Category } from '@/domain/catalog/types'
import { formatCents } from '@/lib/money-format'
import { useStore } from '@/lib/store'
import { QuantitySelector } from '@/components/ui/QuantitySelector'
import { ProductGrid } from '@/components/product/ProductGrid'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { Breadcrumb, type Crumb } from '@/components/ui/Breadcrumb'
import {
  ProductDetailsOverlay,
  type DetailsSection,
} from '@/components/product/ProductDetailsOverlay'
import { Icon } from '@/components/ui/Icon'
import { useRipple } from '@/hooks/use-ripple'

/**
 * Ficha de producto compartida (brief overlay §17): la ruta
 * `/products/$slug` la renderiza con datos del loader (SSR/SEO) y el
 * quick-view la renderiza dentro del overlay con datos de React Query.
 * Es la MISMA vista: nada duplicado.
 */

export type ProductDetailData = NonNullable<Awaited<ReturnType<typeof getProductBySlug>>>

export interface ProductDetailViewProps {
  readonly product: ProductDetailData
  readonly categories: readonly Category[]
  /** Cierre del overlay al navegar desde las migas (no aplica en la ruta). */
  readonly onNavigate?: () => void
  /**
   * `true` dentro del quick-view (Plan 05 §4.4): el overlay de detalles no
   * toca el scroll del body (el quick-view ya lo bloquea) y su Escape no se
   * propaga (cierra primero el panel, después el quick-view).
   */
  readonly nested?: boolean
}

export function ProductDetailView({
  product,
  categories,
  onNavigate,
  nested = false,
}: ProductDetailViewProps) {
  const { addToCart, toggleWishlist, isWishlisted } = useStore()
  const [color, setColor] = useState(product.colors[0] ?? '')
  const [quantity, setQuantity] = useState(1)
  const [imageIndex, setImageIndex] = useState(0)
  // Overlay de detalles (Plan 05 §4.3): sección abierta ahora mismo.
  const [detailsSection, setDetailsSection] = useState<DetailsSection | null>(null)
  // Onda de click en «Añadir al carrito» y wishlist (Plan 05 §5.3).
  const { onPointerDown, onKeyDown } = useRipple()

  // Umbral de envío gratuito desde `site_settings` (defecto D37): la UI no
  // tiene constantes de envío.
  const { data: settings } = useQuery({
    queryKey: queryKeys.siteSettings(),
    queryFn: () => getSiteSettings(),
    staleTime: 5 * 60_000,
  })

  // Stock por variante (defecto D14): la talla/color elegido manda.
  const variant = product.variants.find((v) => v.color === color)
  const variantStock = variant?.stock ?? 0
  const soldOut = variantStock === 0
  const wishlisted = isWishlisted(product.id)
  const category = categories.find((c) => c.id === product.category)

  const middleCrumbs: Crumb[] = category
    ? [
        {
          label: category.name,
          linkProps: {
            to: '/shop',
            search: { category: product.category },
            onClick: onNavigate,
          },
        },
      ]
    : []
  const breadcrumbItems: Crumb[] = [
    { label: 'Inicio', linkProps: { to: '/', onClick: onNavigate } },
    { label: 'Tienda', linkProps: { to: '/shop', onClick: onNavigate } },
    ...middleCrumbs,
    { label: product.name },
  ]

  return (
    <div className="animate-fade-in">
      {/* Las migas van al FINAL de la página (Plan 04 §2.14), no arriba. */}

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
                  imageIndex === i ? 'border-strong' : 'border-transparent'
                }`}
                aria-label={`Ver imagen ${i + 1}`}
              >
                <img src={src} alt="" className="aspect-3/4 w-full object-cover" />
              </button>
            ))}
          </div>
          <div className="flex-1 bg-subtle">
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
                    imageIndex === i ? 'border-strong' : 'border-transparent'
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
          <h1 className="mb-4 editorial-title">
            {product.name}
          </h1>

          <p className="mb-6 flex items-baseline gap-3">
            <span className={`text-lg ${product.compareAtPriceCents ? 'text-gold' : ''}`}>
              {formatCents(product.priceCents)}
            </span>
            {product.compareAtPriceCents && (
              <span className="text-sm text-text-secondary line-through">
                {formatCents(product.compareAtPriceCents)}
              </span>
            )}
          </p>

          <p className="mb-8 max-w-md text-sm leading-relaxed text-text-secondary">
            {product.description}
          </p>

          {/* Color — cada opción muestra su disponibilidad real */}
          <div className="mb-8">
            <p className="eyebrow mb-3">
              Color: <span className="text-strong">{color}</span>
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
                  className={`border px-5 py-2.5 label-sm tracking-[0.15em] transition-colors disabled:cursor-not-allowed disabled:text-text-secondary disabled:line-through ${
                    color === v.color
                      ? 'border-strong bg-strong text-surface'
                      : 'border-line hover:border-line-medium'
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
              max={Math.max(1, variantStock)}
            />
            <span className="text-xs text-text-secondary" role="status">
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
            onClick={() => addToCart(product.id, color, quantity)}
            onPointerDown={onPointerDown}
            onKeyDown={onKeyDown}
            className="mb-4 btn btn-solid btn-block label-wide disabled:cursor-not-allowed disabled:bg-line-light"
          >
            {soldOut ? 'Agotado' : 'Añadir al carrito'}
          </button>

          <button
            type="button"
            onClick={() => toggleWishlist(product.id)}
            onPointerDown={onPointerDown}
            onKeyDown={onKeyDown}
            className="ripple-host mb-10 w-full border border-strong py-4 label-wide transition-colors hover:bg-subtle"
          >
            {wishlisted ? '♥ En wishlist' : '♡ Añadir a wishlist'}
          </button>

          {/* Detalles — Plan 05 §4.3: los `<details>` pasan a botones que
              abren el overlay deslizante. Misma piel (eyebrow + chevron que
              rota), `aria-expanded`/`aria-controls`, misma información. */}
          <div className="space-y-4 border-t border-line pt-8 text-sm">
            <button
              type="button"
              onClick={() => setDetailsSection('product')}
              aria-expanded={detailsSection === 'product'}
              aria-controls="details-overlay-product"
              className="eyebrow flex w-full cursor-pointer items-center justify-between gap-3 text-left"
            >
              Detalles del producto
              <Icon
                name="chevron-down"
                size={14}
                className={`transition-transform duration-[320ms] ${
                  detailsSection === 'product' ? 'rotate-180' : ''
                }`}
              />
            </button>
            <button
              type="button"
              onClick={() => setDetailsSection('shipping')}
              aria-expanded={detailsSection === 'shipping'}
              aria-controls="details-overlay-shipping"
              className="eyebrow flex w-full cursor-pointer items-center justify-between gap-3 text-left"
            >
              Envío y devoluciones
              <Icon
                name="chevron-down"
                size={14}
                className={`transition-transform duration-[320ms] ${
                  detailsSection === 'shipping' ? 'rotate-180' : ''
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Relacionados */}
      {product.id && <RelatedSection slug={product.slug} />}

      {/* Migas al final de la página (Plan 04 §2.14), antes del pie */}
      <div className="mx-auto max-w-7xl px-4 pb-10 md:px-8">
        <Breadcrumb items={breadcrumbItems} />
      </div>

      {/* Overlay de detalles (Plan 05 §4): una sola implementación sirve a la
          ruta y al quick-view (la ficha es compartida). */}
      <ProductDetailsOverlay
        open={detailsSection !== null}
        section={detailsSection}
        onClose={() => setDetailsSection(null)}
        product={product}
        freeShippingThresholdCents={settings?.freeShippingThresholdCents}
        nested={nested}
      />
    </div>
  )
}

function RelatedSection({ slug }: { slug: string }) {
  const { data: related, isPending } = useRelatedProducts(slug)
  // «Cargando» no es «vacío» (D35): sólo se oculta la sección cuando la
  // respuesta ya está y no hay relacionados.
  if (isPending || !related || related.length === 0) return null
  return (
    <section className="mx-auto max-w-7xl px-4 pb-24 md:px-8">
      <SectionHeading eyebrow="También le puede gustar" title="Relacionados" />
      <ProductGrid products={related} />
    </section>
  )
}

function useRelatedProducts(slug: string) {
  return useQuery({
    queryKey: queryKeys.related(slug),
    queryFn: () => import('@/features/commerce.api').then((m) => m.listRelatedProducts({ data: { slug } })),
  })
}
