import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useStore } from '@/lib/store'
import { Icon } from '@/components/ui/Icon'
import { useScrollState } from '@/hooks/use-scroll-state'
import { useChromeHeight } from '@/hooks/use-chrome-height'
import { AnnouncementBar } from './AnnouncementBar'
import { MenuModal } from './MenuModal'
import { MegaDropdown } from './MegaDropdown'
import { SearchOverlay } from './SearchOverlay'
import { useMegaMenu } from './use-mega-menu'
import HEADER_LOGO_URL from '@/public/logo.png'
import type { NavCategory, NavCollection } from './MegaMenu'

export interface HeaderProps {
  readonly categories: readonly NavCategory[]
  readonly collections: readonly NavCollection[]
}

/**
 * Cabecera de la referencia (Plan 04 §2.1): tres zonas —botones «Menú» y
 * «Buscar» a la izquierda, wordmark centrado, wishlist y carrito con el
 * contador dentro del botón a la derecha— y altura de 3.375 rem.
 *
 * Sobre el botón «Menú» vive el mega dropdown multinivel por hover (brief
 * §1–§3), sólo en desktop con puntero fino; el click sigue abriendo el modal
 * fullscreen y en táctil el modal es la única vía (§13).
 */
export function Header({ categories, collections }: HeaderProps) {
  const { cartCount, setCartOpen } = useStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const mega = useMegaMenu()

  // Plan 05 §3: transparente en el top, cortina blanca al hacer scroll. El
  // mega abierto fuerza el estado opaco. La medición del chrome (anuncio +
  // cabecera → `--chrome-h`) se monta aquí, una sola vez.
  const scrollState = useScrollState(mega.state.isOpen)
  useChromeHeight()

  return (
    <>
      <AnnouncementBar headerState={scrollState} />
      <header
        data-header-state={scrollState}
        /* El cierre sólo se programa al salir del header completo: el panel
           es hijo suyo (top-full), así que recorrer botón → header → panel
           nunca dispara `scheduleClose` (brief §15/§19). */
        onMouseEnter={mega.cancelClose}
        onMouseLeave={mega.scheduleClose}
        className="sticky top-0 z-40"
      >
        {/* Cortina blanca (Plan 05 §3.2): la única capa que se anima; el
            contenido no se mueve, así que no hay salto de layout. */}
        <div aria-hidden className="header-surface" />
        <div className="relative z-10 grid min-h-[3.375rem] grid-cols-[1fr_auto_1fr] items-center gap-2.5 px-5 py-[0.938rem] md:px-10">
          {/* Zona izquierda: Menú + Buscar (texto + icono, §2.1) */}
          <div className="flex items-center gap-5">
            <button
              type="button"
              onMouseEnter={mega.open}
              onClick={() => {
                // El click conserva el modal fullscreen (decisión de producto);
                // el dropdown se rige por hover y se cierra al pulsar.
                mega.close()
                setMenuOpen(true)
              }}
              aria-haspopup="true"
              aria-expanded={mega.state.isOpen || menuOpen}
              className="flex items-center gap-2 text-[13px] uppercase tracking-[0.2em] transition-colors hover:text-text-secondary"
            >
              <Icon name="menu" size={18} />
              Menú
            </button>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 text-[13px] uppercase tracking-[0.2em] transition-colors hover:text-text-secondary"
            >
              <Icon name="search" size={18} />
              Buscar
            </button>
          </div>

          {/* Centro: logo (PNG de la carpeta `public`). El archivo trae mucho
              aire transparente arriba y abajo, así que se pinta más alto y se
              recorta con el contenedor para dejar la firma a la altura de la
              cabecera sin que esta crezca. */}
          <Link
            to="/"
            aria-label="Maison Lumière"
            className="flex h-[1.55rem] items-center justify-center overflow-hidden transition-opacity hover:opacity-70"
          >
            <img
              src={HEADER_LOGO_URL}
              alt=""
              className="h-[3.7rem] w-auto max-w-none"
            />
          </Link>

          {/* Zona derecha: wishlist + carrito con contador dentro (§2.1) */}
          <div className="flex items-center justify-end gap-5">
            <Link
              to="/wishlist"
              aria-label="Wishlist"
              className="transition-colors hover:text-text-secondary"
            >
              <Icon name="heart" size={18} />
            </Link>
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              aria-label="Abrir carrito"
              className="flex items-center gap-1.5 transition-colors hover:text-text-secondary"
            >
              <Icon name="cart" size={18} />
              {cartCount > 0 && (
                <span className="text-[11px] tabular-nums">{cartCount}</span>
              )}
              {/* Anuncio a lectores de pantalla al actualizar el carrito (§9) */}
              <span role="status" className="sr-only">
                {cartCount > 0
                  ? `${cartCount} ${cartCount === 1 ? 'artículo' : 'artículos'} en el carrito`
                  : 'Carrito vacío'}
              </span>
            </button>
          </div>
        </div>

        {/* Dropdown multinivel: es hijo del header, así que `top-full` lo ancla
            justo debajo sin hueco real con el botón (brief §19). */}
        <MegaDropdown
          categories={categories}
          collections={collections}
          menu={mega}
        />
      </header>

      <MenuModal
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        categories={categories}
        collections={collections}
        onSearch={() => setSearchOpen(true)}
      />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  )
}
