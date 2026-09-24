import { useEffect, useRef, type ReactNode } from 'react'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

/**
 * Drawer accesible (plan.md D9): role="dialog" + aria-modal, cierre con
 * Escape, foco atrapado mientras está abierto y restauración del foco al
 * elemento disparador al cerrar. El bloqueo de scroll se mantiene.
 */
export function Drawer({ open, onClose, title, children }: DrawerProps) {
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
      className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`}
      aria-hidden={!open}
    >
      {/* Overlay */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-ink/30 transition-opacity duration-500 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      />
      {/* Panel — inert cuando está cerrado: sin foco accesible (axe: aria-hidden-focus) */}
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal={open}
        aria-label={title}
        inert={!open}
        className={`absolute right-0 top-0 h-full w-full max-w-md bg-ivory shadow-2xl transition-transform duration-500 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="flex items-center justify-between border-b border-linen px-6 py-5">
          <h2 className="label-sm-wide">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-xl leading-none text-taupe transition-colors hover:text-ink"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </header>
        <div className="flex h-[calc(100%-61px)] flex-col">{children}</div>
      </aside>
    </div>
  )
}
