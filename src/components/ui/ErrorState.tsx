import { Link } from '@tanstack/react-router'

/**
 * Estado de error compartido por todas las rutas (defecto D19: no existía
 * ningún `errorComponent`). Muestra un mensaje honesto, un reintento y una
 * salida a la tienda; nunca un stack ni detalles internos.
 */
export function ErrorState({
  title = 'Algo no ha ido bien',
  message = 'No hemos podido cargar esta página. Vuelva a intentarlo en un momento.',
  onRetry,
}: {
  title?: string
  message?: string
  onRetry?: () => void
}) {
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center"
    >
      <p className="mb-3 label-wide tracking-[0.3em] text-text-secondary">Error</p>
      <h1 className="mb-4 text-[1.4375rem] font-medium uppercase tracking-[-0.03em] md:text-[1.9375rem]">
        {title}
      </h1>
      <p className="body-text mb-10 max-w-sm text-text-secondary">{message}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {onRetry && (
          <button type="button" onClick={onRetry} className="btn btn-outline label">
            Reintentar
          </button>
        )}
        <Link to="/shop" className="btn btn-outline label">
          Ir a la tienda
        </Link>
      </div>
    </div>
  )
}

/** Estado de carga por defecto de las rutas con datos (defecto D19). */
export function RoutePending() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-14 md:px-8 md:py-20" aria-busy="true">
      <p className="eyebrow mb-8">Cargando…</p>
      <div className="skeleton mb-4 h-10 w-64" />
      {/* Rejilla de la referencia: 2 columnas en móvil, 4 ≥768 px, sin gutter. */}
      <div className="grid grid-cols-2 gap-0 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-3">
            <div className="skeleton aspect-3/4 w-full" />
            <div className="skeleton h-4 w-2/3" />
            <div className="skeleton h-4 w-1/3" />
          </div>
        ))}
      </div>
    </div>
  )
}
