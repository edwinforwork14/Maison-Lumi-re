import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useStore } from '@/lib/store'
import { navSections, MegaMenu, type NavSection } from './MegaMenu'
import { MobileMenu } from './MobileMenu'
import { SearchOverlay } from './SearchOverlay'

export function Header() {
  const { cartCount, setCartOpen } = useStore()
  const [openNav, setOpenNav] = useState<NavSection | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <>
      <header
        className="sticky top-0 z-40 border-b border-linen bg-ivory/95 backdrop-blur"
        onMouseLeave={() => setOpenNav(null)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpenNav(null)
        }}
      >
        {/* Barra superior editorial */}
        <div className="hidden bg-sand px-8 py-2 text-center label-xs-wide text-taupe md:block">
          Envío gratuito a partir de 500 € · Devoluciones extendidas 30 días
        </div>

        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-8">
          {/* Mobile: hamburger */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="p-2 lg:hidden"
            aria-label="Abrir menú"
          >
            <span className="block w-6 border-t border-ink" />
            <span className="mt-1.5 block w-6 border-t border-ink" />
            <span className="mt-1.5 block w-4 border-t border-ink" />
          </button>

          {/* Nav izquierda (desktop) */}
          <nav className="hidden flex-1 items-center gap-8 lg:flex">
            {navSections.map((section) => (
              <div key={section.label} className="group-nav relative">
                <Link
                  to={section.to}
                  onMouseEnter={() => setOpenNav(section)}
                  onFocus={() => setOpenNav(section)}
                  aria-expanded={openNav?.label === section.label}
                  className={`py-2 label transition-colors ${
                    openNav?.label === section.label
                      ? 'text-ink'
                      : 'text-charcoal hover:text-taupe'
                  }`}
                >
                  {section.label}
                </Link>
              </div>
            ))}
          </nav>

          {/* Logo centrado */}
          <Link to="/" className="shrink-0 px-4 lg:absolute lg:left-1/2 lg:-translate-x-1/2">
            <span className="font-serif text-xl tracking-[0.3em] md:text-2xl">
              MAISON LUMIÈRE
            </span>
          </Link>

          {/* Iconos derecha */}
          <div className="flex flex-1 items-center justify-end gap-4 md:gap-6">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="text-sm uppercase tracking-[0.15em] text-charcoal transition-colors hover:text-taupe max-md:hidden"
              aria-label="Buscar"
            >
              Buscar
            </button>
            <Link
              to="/account"
              className="text-sm transition-colors hover:text-taupe max-md:hidden"
              aria-label="Cuenta"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
            </Link>
            <Link
              to="/wishlist"
              className="text-sm transition-colors hover:text-taupe max-md:hidden"
              aria-label="Wishlist"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                <path d="M12 21s-7.5-4.8-9.6-9.1C.9 8.7 2.6 5 6.1 5c2.1 0 3.7 1.2 4.6 2.5H13.3C14.2 6.2 15.8 5 17.9 5c3.5 0 5.2 3.7 3.7 6.9C19.5 16.2 12 21 12 21z" transform="scale(0.92) translate(1,1)" />
              </svg>
            </Link>
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="relative text-sm transition-colors hover:text-taupe"
              aria-label="Abrir carrito"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                <path d="M6 8h12l-1 13H7L6 8z" />
                <path d="M9 8V6a3 3 0 0 1 6 0v2" />
              </svg>
              {cartCount > 0 && (
                <span className="absolute -right-2 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-ink text-[9px] text-ivory">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Mega menú */}
        {openNav && <MegaMenu section={openNav} />}
      </header>

      <MobileMenu open={mobileOpen} onClose={() => setMobileOpen(false)} />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  )
}
