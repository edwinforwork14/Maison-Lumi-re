import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
} from '@tanstack/react-router'
import { StoreProvider } from '@/lib/store'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { CartDrawer } from '@/components/cart/CartDrawer'
import '@/styles.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
})

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      {
        title: 'Maison Lumière — Moda y accesorios de lujo',
      },
      {
        name: 'description',
        content:
          'Gafas, bolsos, zapatos y accesorios hechos a mano en ateliers europeos. Maison Lumière, casa de moda desde 1987.',
      },
      { property: 'og:title', content: 'Maison Lumière' },
      {
        property: 'og:description',
        content: 'Moda y accesorios de lujo hechos a mano.',
      },
      { property: 'og:type', content: 'website' },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300&family=Jost:wght@300;400;500&display=swap',
      },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFound,
})

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <RootDocument>
        <Outlet />
      </RootDocument>
    </QueryClientProvider>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es">
      <head>
        <HeadContent />
      </head>
      <body>
        <a href="#main" className="skip-link">
          Ir al contenido
        </a>
        <StoreProvider>
          <div className="flex min-h-screen flex-col">
            <Header />
            <main id="main" className="flex-1">{children}</main>
            <Footer />
          </div>
          <CartDrawer />
        </StoreProvider>
        <Scripts />
      </body>
    </html>
  )
}

function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-32 text-center">
      <p className="mb-3 label-wide tracking-[0.3em] text-taupe">
        Error 404
      </p>
      <h1 className="mb-4 font-serif text-4xl font-light">
        La página que busca no existe
      </h1>
      <p className="mb-10 text-sm text-taupe">
        Puede que el enlace haya cambiado o que la pieza ya no esté disponible.
      </p>
      <a
        href="/"
        className="btn btn-outline px-8 py-3 label"
      >
        Volver al inicio
      </a>
    </div>
  )
}
