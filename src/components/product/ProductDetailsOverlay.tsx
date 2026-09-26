import { useEffect, useState, type ReactNode } from 'react'
import { useDialog } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { formatCents } from '@/lib/money-format'
import type { ProductDetailData } from './ProductDetailView'

/**
 * Overlay de los detalles del producto (Plan 05 §4): sustituye al acordeón
 * `<details>` de la ficha compartida. Una sola implementación, dos
 * geometrías por CSS —sin lógica de breakpoint en JS—:
 *
 * | Viewport | Entrada                    | Medidas                              |
 * | `< md`   | de abajo hacia arriba      | `inset-x-0 bottom-0 max-h-[85svh]`   |
 * | `≥ md`   | desde la derecha           | `right-0 top-0 h-full w-[min(100%,480px)]` |
 *
 * Reutiliza `useDialog` (foco atrapado, Escape, restauración del foco) y el
 * patrón de panel persistente + `inert` (animación interrumpible, como
 * `Modal.tsx`). El cierre en cascada lo resuelve el CSS: la clase cerrada
 * lleva las dos traslaciones resueltas por breakpoint
 * (`translate-y-full md:translate-x-full md:translate-y-0`).
 */

export type DetailsSection = 'product' | 'shipping'

export interface ProductDetailsOverlayProps {
  readonly open: boolean
  readonly onClose: () => void
  /** Sección activa: define el contenido y el `aria-labelledby`. */
  readonly section: DetailsSection | null
  readonly product: ProductDetailData
  readonly freeShippingThresholdCents?: number
  /**
   * `true` cuando el panel se abre DENTRO del quick-view: no toca el scroll
   * del body (el quick-view ya lo bloquea; dos escrituras de
   * `body.overflow` pueden dejarlo desbloqueado al cerrar, §9.3).
   */
  readonly nested?: boolean
}

const sectionTitle: Record<DetailsSection, string> = {
  product: 'Detalles del producto',
  shipping: 'Envío y devoluciones',
}

export function ProductDetailsOverlay({
  open,
  onClose,
  section,
  product,
  freeShippingThresholdCents,
  nested = false,
}: ProductDetailsOverlayProps) {
  // El panel es persistente (nunca se desmonta): `useDialog` sólo puede
  // bloquear el scroll cuando NO es anidado; `open` controla el resto.
  const { panelRef } = useDialog<HTMLDivElement>(open && !nested, onClose)
  const [renderContent, setRenderContent] = useState(false)

  // El contenido se monta al abrir y se retira cuando la transición de
  // cierre termina (transición de 320 ms + margen): la animación de salida
  // se ve y el contenido no queda vivo detrás del panel.
  useEffect(() => {
    if (open) {
      setRenderContent(true)
      return
    }
    const timer = window.setTimeout(() => setRenderContent(false), 400)
    return () => window.clearTimeout(timer)
  }, [open])

  // Escape en un panel anidado no debe cerrar también el quick-view.
  useEffect(() => {
    if (!open || !nested) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, nested, onClose])

  return (
    <div
      className={`fixed inset-0 z-[60] ${open ? '' : 'pointer-events-none'}`}
      aria-hidden={!open}
    >
      {/* Velo: fundido con `--duration-base`. En modo anidado vive dentro del
          quick-view (posicionado por el caller), no de la ventana. */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-overlay transition-opacity duration-[320ms] ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      />
      {/* Panel — persistente e `inert` al cerrar: animación interrumpible. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal={open}
        aria-labelledby={section ? `details-overlay-${section}` : undefined}
        inert={!open}
        className={[
          // Móvil: hoja desde abajo. Escritorio: panel desde la derecha.
          'absolute inset-x-0 bottom-0 max-h-[85svh] rounded-t-[4px] bg-surface shadow-2xl',
          'md:inset-x-auto md:bottom-auto md:right-0 md:top-0 md:h-full md:max-h-full md:w-[min(100%,480px)] md:rounded-t-none',
          'flex flex-col transition-transform duration-[320ms] ease-[cubic-bezier(.23,1,.32,1)]',
          open
            ? 'translate-y-0 md:translate-x-0'
            : 'translate-y-full md:translate-x-full md:translate-y-0',
          nested ? 'z-20' : '',
        ].join(' ')}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-line px-6 py-4">
          <p className="body-strong">
            {section ? sectionTitle[section] : ''}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="grid size-10 place-items-center text-text-secondary transition-colors hover:text-strong"
            aria-label="Cerrar"
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 text-sm">
          {renderContent && section === 'product' && (
            <Staggered>
              <ul className="stagger-item space-y-1.5 text-text-secondary" style={{ '--i': 0 } as React.CSSProperties}>
                <li>· Materiales: {product.materials.join(', ')}</li>
                <li>· Colores disponibles: {product.colors.join(', ')}</li>
                <li>· Ref. {product.id.toUpperCase()}</li>
              </ul>
            </Staggered>
          )}
          {renderContent && section === 'shipping' && (
            <Staggered>
              <p className="stagger-item text-text-secondary" style={{ '--i': 0 } as React.CSSProperties}>
                Envío estándar 3–5 días
                {freeShippingThresholdCents
                  ? ` (gratuito a partir de ${formatCents(freeShippingThresholdCents)})`
                  : ''}
                . Express 24–48 h. Devoluciones gratuitas durante 30 días.
              </p>
            </Staggered>
          )}
        </div>
      </div>
    </div>
  )
}

/** Envuelve el contenido para que el escalonado se reinicie en cada apertura. */
function Staggered({ children }: { children: ReactNode }) {
  return <div className="animate-content-stagger">{children}</div>
}
