import { defineConfig } from 'drizzle-kit'

/**
 * Configuración de drizzle-kit (plan 01 §7).
 *
 * - `generate` NO necesita conexión: produce el SQL a partir del esquema y lo
 *   deja versionado en `./drizzle` para que el PR lo revise.
 * - `migrate`, `studio` y `push` SÍ necesitan `DATABASE_URL`; si falta, el
 *   error es explícito en lugar de un fallo de conexión confuso.
 *
 * El comando se detecta desde `argv` porque el módulo se evalúa antes de que
 * drizzle-kit valide las credenciales.
 */
const command = process.argv.slice(2).find((argument) => !argument.startsWith('-')) ?? ''
const requiresConnection = ['migrate', 'push', 'studio', 'drop', 'check', 'up'].includes(command)
const databaseUrl = process.env.DATABASE_URL ?? ''

if (requiresConnection && databaseUrl.length === 0) {
  throw new Error(
    `drizzle-kit ${command}: falta DATABASE_URL. Define la conexión de PostgreSQL, p. ej. DATABASE_URL=postgres://usuario:clave@localhost:5432/maison_lumiere`,
  )
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url: databaseUrl },
})
