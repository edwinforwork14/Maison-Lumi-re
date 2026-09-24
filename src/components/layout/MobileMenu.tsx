import { Link } from '@tanstack/react-router'
import { categories, collections } from '@/data'

interface MobileMenuProps {
  open: boolean
  onClose: () => void
}

export function MobileMenu({ open, onClose }: MobileMenuProps) {
  return (
    <div
      className={`fixed inset-0 z-50 lg:hidden ${open ? '' : 'pointer-events-none'}`}
      aria-hidden={!open}
    >
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-ink/30 transition-opacity duration-500 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <aside
        className={`absolute left-0 top-0 h-full w-[85%] max-w-sm overflow-y-auto bg-ivory transition-transform duration-500 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <header className="flex items-center justify-between border-b border-linen px-6 py-5">
          <span className="font-serif text-lg tracking-wide">MAISON LUMIÈRE</span>
          <button
            type="button"
            onClick={onClose}
            className="text-xl text-taupe hover:text-ink"
            aria-label="Cerrar menú"
          >
            ✕
          </button>
        </header>

        <nav className="px-6 py-8">
          <p className="mb-4 text-[11px] uppercase tracking-[0.25em] text-taupe">
            Categorías
          </p>
          <ul className="space-y-4">
            <li>
              <Link
                to="/shop"
                onClick={onClose}
                className="font-serif text-2xl font-light"
              >
                Todo el catálogo
              </Link>
            </li>
            {categories.map((c) => (
              <li key={c.id}>
                <Link
                  to="/shop"
                  search={{ category: c.id }}
                  onClick={onClose}
                  className="font-serif text-2xl font-light"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>

          <p className="mb-4 mt-10 text-[11px] uppercase tracking-[0.25em] text-taupe">
            Colecciones
          </p>
          <ul className="space-y-3">
            {collections.map((c) => (
              <li key={c.id}>
                <Link
                  to="/shop"
                  search={{ collection: c.id }}
                  onClick={onClose}
                  className="text-sm"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>

          <p className="mb-4 mt-10 text-[11px] uppercase tracking-[0.25em] text-taupe">
            Cuenta
          </p>
          <ul className="space-y-3 text-sm">
            <li>
              <Link to="/account" onClick={onClose}>
                Mi cuenta
              </Link>
            </li>
            <li>
              <Link to="/wishlist" onClick={onClose}>
                Wishlist
              </Link>
            </li>
            <li>
              <Link to="/login" onClick={onClose}>
                Iniciar sesión
              </Link>
            </li>
          </ul>
        </nav>
      </aside>
    </div>
  )
}
