import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

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
  })
  return router
}
