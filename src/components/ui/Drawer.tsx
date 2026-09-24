import { useEffect, type ReactNode } from 'react'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export function Drawer({ open, onClose, title, children }: DrawerProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
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
      {/* Panel */}
      <aside
        className={`absolute right-0 top-0 h-full w-full max-w-md bg-ivory shadow-2xl transition-transform duration-500 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="flex items-center justify-between border-b border-linen px-6 py-5">
          <h2 className="text-xs uppercase tracking-[0.25em]">{title}</h2>
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
