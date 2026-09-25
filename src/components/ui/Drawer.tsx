import type { ReactNode } from 'react'
import { useDialog } from './Modal'

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
 * La lógica de comportamiento vive en `useDialog` (Plan 04 §3.1), compartida
 * con `Modal`.
 */
export function Drawer({ open, onClose, title, children }: DrawerProps) {
  const { panelRef } = useDialog<HTMLElement>(open, onClose)

  return (
    <div
      className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`}
      aria-hidden={!open}
    >
      {/* Overlay */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-strong/30 transition-opacity duration-500 ${
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
        className={`absolute right-0 top-0 h-full w-full max-w-md bg-surface shadow-2xl transition-transform duration-500 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="flex items-center justify-between border-b border-line px-6 py-5">
          <h2 className="label-sm-wide">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-xl leading-none text-text-secondary transition-colors hover:text-strong"
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
