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
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es">
      <head>
        <HeadContent />
      </head>
      <body>
        <StoreProvider>
          <div className="flex min-h-screen flex-col">
            <Header />
            <main className="flex-1">{children}</main>
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
      <p className="mb-3 text-[11px] uppercase tracking-[0.3em] text-taupe">
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
        className="border border-ink px-8 py-3 text-[11px] uppercase tracking-[0.2em] transition-colors hover:bg-ink hover:text-ivory"
      >
        Volver al inicio
      </a>
    </div>
  )
}
