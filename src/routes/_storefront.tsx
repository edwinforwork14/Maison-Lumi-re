import { createFileRoute, Outlet } from '@tanstack/react-router'
import { StoreProvider } from '@/lib/store'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { CartDrawer } from '@/components/cart/CartDrawer'
import { listCategories, listCollections } from '@/features/commerce.api'

/**
 * Layout de la tienda (pathless: no añade segmento a la URL).
 *
 * Aquí vive el chrome del storefront —cabecera, pie, drawer del carrito y el
 * estado de cliente— y aquí se resuelve la navegación. Antes colgaba todo del
 * documento raíz, así que el panel de administración compartía cabecera y pie
 * de la tienda y cargaba datos que no necesita.
 */
export const Route = createFileRoute('/_storefront')({
  /**
   * La navegación (categorías y colecciones) se resuelve en el servidor: los
   * enlaces salen en el HTML del SSR y el catálogo mock no viaja al navegador.
   */
  loader: async () => ({
    navigation: {
      categories: await listCategories(),
      collections: await listCollections(),
    },
  }),
  component: StorefrontLayout,
})

function StorefrontLayout() {
  const { navigation } = Route.useLoaderData()

  return (
    <StoreProvider>
      <div className="flex min-h-screen flex-col">
        <Header categories={navigation.categories} collections={navigation.collections} />
        <main id="main" className="flex-1">
          <Outlet />
        </main>
        <Footer categories={navigation.categories} />
      </div>
      <CartDrawer />
    </StoreProvider>
  )
}
