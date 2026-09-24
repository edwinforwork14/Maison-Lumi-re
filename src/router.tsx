import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { ErrorState, RoutePending } from '@/components/ui/ErrorState'

/**
 * Serializador de search params con formato plano (URLSearchParams):
 * ?material=Acetato&material=Metal en lugar del array JSON por defecto
 * (?material=["Acetato","Metal"]). URLs compartibles y canónicas.
 */
function flatStringifySearch(
  search: Record<string, unknown>,
): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item))
    } else {
      params.set(key, String(value))
    }
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    stringifySearch: flatStringifySearch,
    // Defecto D19: toda ruta (presente o futura) tiene estado de carga y de
    // error sin repetir el componente en cada archivo.
    defaultPendingComponent: RoutePending,
    defaultPendingMs: 150,
    defaultPendingMinMs: 200,
    defaultErrorComponent: ({ error, reset }) => (
      <ErrorState
        message={
          error instanceof Error && error.message
            ? error.message
            : 'No hemos podido cargar esta página. Vuelva a intentarlo en un momento.'
        }
        onRetry={reset}
      />
    ),
  })
  return router
}
