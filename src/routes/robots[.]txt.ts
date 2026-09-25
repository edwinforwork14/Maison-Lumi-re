import { createFileRoute } from '@tanstack/react-router'

/** `GET /robots.txt` (Plan 03 §6): sin indexar el panel ni la cuenta. */
export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { buildRobotsTxt } = await import('@/server/services/seo')
        const base = process.env.PUBLIC_SITE_URL || new URL(request.url).origin
        return new Response(buildRobotsTxt(base), {
          headers: {
            'content-type': 'text/plain; charset=utf-8',
            'cache-control': 'public, max-age=3600',
          },
        })
      },
    },
  },
})
