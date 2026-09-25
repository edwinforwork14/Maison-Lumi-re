import { Link } from '@tanstack/react-router'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { buildNavSections, type NavCategory, type NavCollection } from './MegaMenu'

/**
 * Modal de menú a pantalla completa (Plan 04 §2.2): sustituye a la
 * navegación horizontal con mega menú por hover (defecto U4). Los grupos de
 * navegación siguen viniendo de `buildNavSections` con los datos resueltos
 * en el servidor; aquí sólo se pinta la lista.
 */
export interface MenuModalProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly categories: readonly NavCategory[]
  readonly collections: readonly NavCollection[]
  /** Abre el modal de búsqueda (la referencia embebe el buscador en el menú). */
  readonly onSearch?: () => void
}

export function MenuModal({
  open,
  onClose,
  categories,
  collections,
  onSearch,
}: MenuModalProps) {
  const sections = buildNavSections(categories, collections)

  return (
    <Modal open={open} onClose={onClose} title="Menú" mode="fullscreen">
      <div className="mx-auto max-w-3xl px-6 py-8 md:px-10 md:py-12">
        {/* Buscador embebido: abre el mismo modal de búsqueda (§2.2). */}
        <button
          type="button"
          onClick={() => {
            onClose()
            onSearch?.()
          }}
          className="mb-10 flex w-full items-center gap-3 border-b border-strong pb-3 text-left text-text-secondary transition-colors hover:text-strong"
        >
          <Icon name="search" size={18} />
          <span className="body-text">Buscar</span>
        </button>

        <nav className="space-y-10">
          {sections.map((section) => (
            <section key={section.label}>
              <div className="mb-4 flex items-baseline justify-between gap-4">
                <h2 className="text-[1.0625rem] font-medium uppercase tracking-[-0.03em]">
                  {section.label}
                </h2>
                <Link
                  to={section.to}
                  onClick={onClose}
                  className="text-[13px] underline underline-offset-4 hover:text-text-secondary"
                >
                  Ver todo
                </Link>
              </div>

              <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
                {section.sections.map((group) => (
                  <div key={group.title}>
                    <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-text-secondary">
                      {group.title}
                    </p>
                    <ul>
                      {group.links.map((link) => (
                        <li key={`${group.title}-${link.label}`}>
                          <Link
                            to={link.to}
                            onClick={onClose}
                            className="block py-1.5 text-[13px] transition-colors hover:text-text-secondary"
                          >
                            {link.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </nav>

        {/* Pie del modal (§2.2). */}
        <footer className="mt-12 flex flex-col gap-3 border-t border-line pt-6 text-[13px]">
          <Link to="/login" onClick={onClose} className="hover:text-text-secondary">
            Iniciar sesión
          </Link>
          <Link to="/account" onClick={onClose} className="hover:text-text-secondary">
            Contáctenos
          </Link>
          <span className="text-text-secondary">Nuestras tiendas</span>
          <p className="mt-2 flex items-center gap-2 text-text-secondary">
            Cambiar ubicación:
            <span className="text-text-primary">España (español)</span>
            <span className="rounded-[4px] bg-subtle px-2 py-1 text-[10px]">€</span>
          </p>
        </footer>
      </div>
    </Modal>
  )
}
