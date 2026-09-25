import { Link } from '@tanstack/react-router'
import { Modal } from '@/components/ui/Modal'

/**
 * Modal de subcategorías (Plan 04 §2.10): rejilla de 2 columnas con enlaces
 * a categorías hermanas; cada enlace mide 48 px de alto con fondo `--subtle`
 * y hover `--subtle-hover`. Se abre desde el selector de categoría de la
 * isla flotante.
 */
export function SubcategoryModal({
  open,
  onClose,
  title,
  categories,
}: {
  readonly open: boolean
  readonly onClose: () => void
  readonly title: string
  readonly categories: readonly { id: string; name: string }[]
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="p-5">
        <ul className="grid grid-cols-2 gap-2">
          <li>
            <Link
              to="/shop"
              onClick={onClose}
              className="flex min-h-12 items-center bg-subtle px-5 py-3 text-[13px] transition-colors hover:bg-subtle-hover"
            >
              Todo el catálogo
            </Link>
          </li>
          {categories.map((category) => (
            <li key={category.id}>
              <Link
                to="/shop"
                search={{ category: category.id }}
                onClick={onClose}
                className="flex min-h-12 items-center bg-subtle px-5 py-3 text-[13px] transition-colors hover:bg-subtle-hover"
              >
                {category.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  )
}
