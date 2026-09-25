import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { cn } from '@/lib/cn'
import { Icon } from './Icon'

/**
 * Comportamiento de diálogo accesible (Plan 04 §3.1): `role="dialog"` +
 * `aria-modal`, cierre con Escape, trampa de foco (`Tab` no escapa),
 * restauración del foco al disparador, bloqueo de scroll e `inert` cuando
 * está cerrado. Es la lógica que ya estaba escrita y probada en
 * `Drawer.tsx` (plan.md D9); se extrae aquí para reutilizarla.
 */
export function useDialog<T extends HTMLElement>(
  open: boolean,
  onClose: () => void,
): { panelRef: RefObject<T | null> } {
  const panelRef = useRef<T | null>(null)
  const triggerRef = useRef<Element | null>(null)

  useEffect(() => {
    if (!open) return
    triggerRef.current = document.activeElement

    const panel = panelRef.current
    const focusables = panel?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
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

  return { panelRef }
}

export type ModalMode = 'centered' | 'panel-right' | 'fullscreen'

const modeCls: Record<ModalMode, string> = {
  // Modal centrado de la referencia: superficie frost, radio 4 px, sombra.
  centered:
    'left-1/2 top-1/2 w-[min(94vw,720px)] max-h-[86vh] -translate-x-1/2 modal-surface',
  // Minicarrito: panel desde la derecha (translateX .3s).
  'panel-right': 'right-0 top-0 h-full w-full max-w-md bg-surface',
  // Menú y búsqueda: modal-header a pantalla completa.
  fullscreen: 'inset-0 bg-surface',
}

const openCls: Record<ModalMode, string> = {
  centered: 'opacity-100 -translate-y-1/2',
  'panel-right': 'translate-x-0',
  fullscreen: 'opacity-100',
}

const closedCls: Record<ModalMode, string> = {
  centered: 'opacity-0 -translate-y-[calc(50%+16px)]',
  'panel-right': 'translate-x-full',
  fullscreen: 'opacity-0',
}

export interface ModalProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly title: string
  readonly mode?: ModalMode
  /** Contenido de la cabecera, a la derecha del título (p. ej. «atrás»). */
  readonly headerExtra?: ReactNode
  readonly children: ReactNode
}

export function Modal({
  open,
  onClose,
  title,
  mode = 'centered',
  headerExtra,
  children,
}: ModalProps) {
  const { panelRef } = useDialog<HTMLDivElement>(open, onClose)

  return (
    <div
      className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`}
      aria-hidden={!open}
    >
      {/* Overlay */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-overlay transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      />
      {/* Panel — inert cuando está cerrado: sin foco accesible. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal={open}
        aria-label={title}
        inert={!open}
        className={cn(
          'absolute flex flex-col transition-all duration-300 ease-[cubic-bezier(.23,1,.32,1)]',
          mode === 'centered' && '-translate-x-1/2',
          modeCls[mode],
          open ? openCls[mode] : closedCls[mode],
        )}
      >
        <header
          className={`flex shrink-0 items-center justify-between gap-4 border-b border-line p-5 ${
            mode === 'fullscreen' ? 'border-none' : ''
          }`}
        >
          <div className="flex items-center gap-3">
            {headerExtra}
            <p className="body-strong">{title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-10 place-items-center text-text-secondary transition-colors hover:text-strong"
            aria-label="Cerrar"
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
