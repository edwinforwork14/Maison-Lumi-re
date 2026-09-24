import { useEffect, useRef } from 'react'
import { Link } from '@tanstack/react-router'
import type { NavCategory, NavCollection } from './MegaMenu'

interface MobileMenuProps {
  open: boolean
  onClose: () => void
}

/**
 * Menú móvil accesible (plan.md D9): role="dialog", aria-modal, foco
 * atrapado, cierre con Escape y bloqueo de scroll mientras está abierto.
 */
/**
 * Menú móvil. Las categorías y colecciones llegan por props desde el layout:
 * este componente ya no importa los mocks de `@/data` (defecto D34), que
 * metían el catálogo entero en el bundle del navegador.
 */
export function MobileMenu({
  open,
  onClose,
  categories,
  collections,
}: MobileMenuProps & {
  readonly categories: readonly NavCategory[]
  readonly collections: readonly NavCollection[]
}) {
  const panelRef = useRef<HTMLElement | null>(null)
  const triggerRef = useRef<Element | null>(null)

  useEffect(() => {
    if (!open) return
    triggerRef.current = document.activeElement

    const panel = panelRef.current
    const focusables = panel?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    focusables?.[0]?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'Tab' && focusables && focusables.length > 0) {
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement
        if (e.shiftKey && active === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      const trigger = triggerRef.current
      if (trigger instanceof HTMLElement) trigger.focus()
    }
  }, [open, onClose])

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
        ref={panelRef}
        role="dialog"
        aria-modal={open}
        aria-label="Menú de navegación"
        inert={!open}
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
          <p className="eyebrow mb-4">Categorías</p>
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

          <p className="eyebrow mb-4 mt-10">Colecciones</p>
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

          <p className="eyebrow mb-4 mt-10">Cuenta</p>
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
