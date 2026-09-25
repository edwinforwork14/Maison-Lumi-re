import { createFileRoute } from '@tanstack/react-router'
import { sql } from 'drizzle-orm'

/**
 * `GET /api/health` (Plan 03 §6). No expone nada sensible: dice si la tienda
 * está operativa y si la base responde. Devuelve 503 cuando la base no lo hace,
 * para que el balanceador saque la instancia en lugar de servir errores.
 */
export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => {
        const base = { status: 'ok' as const, time: new Date().toISOString() }
        try {
          const { isPostgresDataSource } = await import('@/server/runtime/env')
          if (!isPostgresDataSource()) {
            // Sin base configurada la app sigue sirviendo el catálogo en memoria.
            return Response.json({ ...base, dataSource: 'in-memory' })
          }
          const { getDb } = await import('@/server/db/client')
          await getDb().execute(sql`select 1`)
          return Response.json({ ...base, dataSource: 'postgres' })
        } catch (error) {
          return Response.json(
            { status: 'degraded', time: new Date().toISOString(), dataSource: 'postgres' },
            { status: 503 },
          )
        }
      },
    },
  },
})
