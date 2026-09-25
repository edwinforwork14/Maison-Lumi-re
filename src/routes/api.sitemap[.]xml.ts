import { createFileRoute } from '@tanstack/react-router'

/**
 * `GET /api/sitemap.xml` (Plan 03 §6): se genera desde la base —productos
 * publicados y categorías activas— en cada petición. El catálogo es pequeño y
 * cacheable por el buscador; lo importante es que no se desincronice del panel.
 */
export const Route = createFileRoute('/api/sitemap.xml')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { buildSitemap } = await import('@/server/services/seo')
          const base = process.env.PUBLIC_SITE_URL || new URL(request.url).origin
          const xml = await buildSitemap(base)
          return new Response(xml, {
            headers: {
              'content-type': 'application/xml; charset=utf-8',
              'cache-control': 'public, max-age=300',
            },
          })
        } catch (error) {
          // Un sitemap caído no debe tumbar la tienda: 503 con detalle mínimo.
          return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset/>', {
            status: 503,
            headers: { 'content-type': 'application/xml; charset=utf-8' },
          })
        }
      },
    },
  },
})
