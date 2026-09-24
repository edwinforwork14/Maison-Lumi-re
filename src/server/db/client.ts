/**
 * Cliente de base de datos: fábrica **perezosa** sobre `postgres` (postgres.js)
 * + Drizzle (plan 01 §3).
 *
 * Regla de oro de la Fase 2/3: este módulo **no** abre ninguna conexión al
 * importarse. Nada se conecta mientras `DATA_SOURCE=in-memory` (el runtime
 * actual sigue sirviendo el catálogo, los pedidos y las sesiones en memoria).
 * La conexión nace la primera vez que alguien pide `getDb()`, y si falta
 * `DATABASE_URL` el error es explícito y accionable (`CONFIG`).
 */

import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { AppError } from '../errors.ts'
import { env, isDatabaseConfigured } from '../runtime/env.ts'
import * as schema from './schema/index.ts'

export type Database = PostgresJsDatabase<typeof schema>
export type DatabaseSchema = typeof schema

/** Opciones del pool; sobrias a propósito (una instancia, pocos procesos). */
const POOL_OPTIONS = {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
} as const

let cachedDatabase: Database | undefined
let cachedClient: postgres.Sql | undefined

/** `true` si hay `DATABASE_URL`: no implica que la conexión funcione. */
export function canUseDatabase(): boolean {
  return isDatabaseConfigured()
}

/**
 * URL de conexión o error explícito. Nunca devuelve cadena vacía: un
 * `DATABASE_URL=` sin valor se trata como ausente, no como URL válida.
 */
export function requireDatabaseUrl(): string {
  const url = env.DATABASE_URL
  if (!url) {
    throw new AppError(
      'CONFIG',
      'Falta DATABASE_URL: configura la conexión de PostgreSQL en el entorno (por ejemplo `postgres://user:pass@localhost:5432/maison_lumiere`) o mantén DATA_SOURCE=in-memory.',
    )
  }
  return url
}

/** Crea un cliente nuevo (tests, scripts de migración/seed, jobs). */
export function createDbClient(url: string = requireDatabaseUrl()): Database {
  cachedClient = postgres(url, POOL_OPTIONS)
  cachedDatabase = drizzle(cachedClient, { schema })
  return cachedDatabase
}

/**
 * Cliente compartido del proceso. Se crea en la primera llamada: importar este
 * módulo jamás conecta ni exige `DATABASE_URL`.
 */
export function getDb(): Database {
  if (!cachedDatabase) {
    createDbClient()
  }
  return cachedDatabase as Database
}

/** Cliente crudo de `postgres` (transacciones explícitas, `COPY`, healthcheck). */
export function getSqlClient(): postgres.Sql {
  if (!cachedClient) {
    createDbClient()
  }
  return cachedClient as postgres.Sql
}

/** Cierra el pool. Idempotente: llamarlo dos veces no falla. */
export async function closeDb(): Promise<void> {
  const client = cachedClient
  cachedClient = undefined
  cachedDatabase = undefined
  if (client) {
    await client.end({ timeout: 5 })
  }
}

/** Reset sólo para tests: olvida el cliente cacheado sin cerrarlo. */
export function resetDbClientCache(): void {
  cachedClient = undefined
  cachedDatabase = undefined
}
