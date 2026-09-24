/**
 * Validación del entorno con Zod (plan 01 §3: «secretos sólo por entorno,
 * validados con Zod al arrancar; jamás en el bundle cliente»).
 *
 * Este módulo es deliberadamente **inocuo al importarse**: con el entorno por
 * defecto (sin ninguna variable) resuelve `DATA_SOURCE=in-memory` y no lanza.
 * Sólo falla —con un error `CONFIG` legible— cuando hay una variable presente
 * *y* mal formada (por ejemplo un `SESSION_SECRET` demasiado corto).
 *
 * Nota: no carga `.env` por sí mismo. En desarrollo lo inyecta Vite
 * (`loadEnv`), y en producción el orquestador (`node --env-file=…` o el
 * gestor de secretos del despliegue).
 */

import { z } from 'zod'
import { AppError } from '../errors.ts'

/** `DATABASE_URL=` (vacío en `.env.example`) equivale a «no configurado». */
function emptyToUndefined(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value
}

/**
 * Fuente de datos activa. `in-memory` es el runtime actual (adaptadores con
 * `Map`); `postgres` es el destino de la Fase 3 y aún no está conectado a las
 * rutas de la aplicación.
 */
export const dataSourceSchema = z.enum(['in-memory', 'postgres'])
export type DataSource = z.infer<typeof dataSourceSchema>

export const envSchema = z.object({
  DATA_SOURCE: z.preprocess(emptyToUndefined, dataSourceSchema.default('in-memory')),
  /** Cadena de conexión de PostgreSQL; obligatoria si `DATA_SOURCE=postgres`. */
  DATABASE_URL: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  /** Firma de cookies de sesión: mínimo 32 caracteres si está presente. */
  SESSION_SECRET: z.preprocess(emptyToUndefined, z.string().min(32).optional()),
  /** URL pública del sitio (canónicas, enlaces en emails, webhooks). */
  PUBLIC_SITE_URL: z.preprocess(emptyToUndefined, z.url().optional()),
})

export type Env = z.infer<typeof envSchema>

function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '(raíz)'}: ${issue.message}`)
    .join('; ')
}

/**
 * Valida un entorno y devuelve el resultado tipado. Función pura y testeable:
 * recibe la fuente explícitamente para no depender de `process.env`.
 */
export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source)
  if (!result.success) {
    throw new AppError('CONFIG', `Entorno inválido → ${describeIssues(result.error)}`)
  }

  const parsed = result.data
  if (parsed.DATA_SOURCE === 'postgres' && !parsed.DATABASE_URL) {
    throw new AppError(
      'CONFIG',
      'DATA_SOURCE=postgres exige DATABASE_URL (o cambia DATA_SOURCE a in-memory).',
    )
  }
  return parsed
}

/** Entorno validado del proceso. Se calcula una vez, al importar. */
export const env: Env = parseEnv()

/** `true` sólo si la fuente activa es PostgreSQL. */
export function isPostgresDataSource(): boolean {
  return env.DATA_SOURCE === 'postgres'
}

/** `true` si hay `DATABASE_URL`; no implica que la conexión funcione. */
export function isDatabaseConfigured(): boolean {
  return typeof env.DATABASE_URL === 'string' && env.DATABASE_URL.length > 0
}

/** Resumen apto para logs: nunca incluye `DATABASE_URL` ni `SESSION_SECRET`. */
export function describeEnv(parsed: Env = env): Record<string, string | boolean> {
  return {
    dataSource: parsed.DATA_SOURCE,
    databaseConfigured: typeof parsed.DATABASE_URL === 'string',
    sessionSecretConfigured: typeof parsed.SESSION_SECRET === 'string',
    publicSiteUrl: parsed.PUBLIC_SITE_URL ?? '(sin definir)',
  }
}
