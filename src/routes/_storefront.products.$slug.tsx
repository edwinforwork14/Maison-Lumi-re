import { createFileRoute, notFound } from '@tanstack/react-router'
import { getProductBySlug, listCategories } from '@/features/commerce.api'
import { ProductDetailView } from '@/components/product/ProductDetailView'

/**
 * Ruta de ficha de producto (SSR/SEO): accesos directos, refresh, compartir
 * enlaces y rastreadores llegan aquí con el HTML completo. La navegación
 * interna desde las tarjetas abre el quick-view (overlay) sin pasar por
 * aquí; ambos renderizan la MISMA `ProductDetailView`.
 */
export const Route = createFileRoute('/_storefront/products/$slug')({
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
  return <ProductDetailView product={product} categories={categories} />
}
