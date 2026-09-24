#!/usr/bin/env node
/**
 * `npm run db:seed` — siembra idempotente del catálogo y la configuración base
 * (plan 01 §7).
 *
 * Node ejecuta el TypeScript del servidor con «type stripping» (Node ≥ 24), así
 * que este envoltorio sólo traduce el fallo en un código de salida y un mensaje
 * legible. `DATABASE_URL` llega del entorno, como el resto de la configuración
 * (`src/server/runtime/env.ts` no lee `.env` por sí mismo): en PowerShell
 * `$env:DATABASE_URL='postgres://…'` y en POSIX `DATABASE_URL=… npm run db:seed`.
 *
 * Idempotente: ejecutarlo dos veces seguidas deja el mismo estado.
 */

import { main } from '../src/server/db/seed/index.ts'

try {
  await main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[db:seed] error: ${message}`)
  process.exitCode = 1
}
