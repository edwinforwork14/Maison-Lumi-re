/**
 * Limitador de intentos de acceso (Plan 02 §3: «CSRF + rate limit en login admin»).
 *
 * Vive en la base de datos, no en memoria: un `Map` se salta reiniciando el
 * proceso y no sirve con varios procesos detrás del mismo balanceador.
 *
 * La política es una función **pura** (`evaluateLoginThrottle`) para poder
 * probar los umbrales sin base de datos; el servicio sólo la alimenta con
 * recuentos reales.
 *
 * Se limita por email (protege la cuenta concreta) y por IP (protege de un
 * barrido de muchas cuentas desde el mismo origen). Nunca se guarda la
 * contraseña ni se distingue si el email existe.
 */

import { and, eq, gte, sql } from 'drizzle-orm'
import { getDb, type Database } from '../../db/client.ts'
import { loginAttempts } from '../../db/schema/identity.ts'
import { AppError } from '../../errors.ts'

export type LoginScope = 'admin' | 'storefront'

export interface ThrottlePolicy {
  /** Fallos permitidos por email dentro de la ventana. */
  readonly maxFailuresPerEmail: number
  /** Fallos permitidos por IP dentro de la ventana. */
  readonly maxFailuresPerIp: number
  readonly windowMinutes: number
}

export const DEFAULT_THROTTLE: ThrottlePolicy = {
  maxFailuresPerEmail: 5,
  maxFailuresPerIp: 20,
  windowMinutes: 15,
}

export interface ThrottleDecision {
  readonly allowed: boolean
  readonly blockedBy?: 'email' | 'ip'
  /** Segundos que conviene esperar antes de reintentar (0 si se permite). */
  readonly retryAfterSeconds: number
}

/**
 * Decide si un intento puede proceder. Los umbrales son deliberadamente
 * distintos: por email basta con 5 fallos (es el ataque dirigido), por IP se
 * tolera más porque varias personas pueden compartir salida a internet.
 */
export function evaluateLoginThrottle(
  counts: { emailFailures: number; ipFailures: number },
  policy: ThrottlePolicy = DEFAULT_THROTTLE,
): ThrottleDecision {
  const windowSeconds = policy.windowMinutes * 60

  if (counts.emailFailures >= policy.maxFailuresPerEmail) {
    return { allowed: false, blockedBy: 'email', retryAfterSeconds: windowSeconds }
  }
  if (counts.ipFailures >= policy.maxFailuresPerIp) {
    return { allowed: false, blockedBy: 'ip', retryAfterSeconds: windowSeconds }
  }
  return { allowed: true, retryAfterSeconds: 0 }
}

export interface LoginThrottleRepository {
  record(input: {
    scope: LoginScope
    email: string
    ip?: string | null
    succeeded: boolean
  }): Promise<void>
  /** Borra los fallos del email: un acceso correcto reinicia su ventana. */
  clearFailures(scope: LoginScope, email: string): Promise<void>
  assertAllowed(input: {
    scope: LoginScope
    email: string
    ip?: string | null
  }): Promise<ThrottleDecision>
}

export function createPostgresLoginThrottle(
  db: Database = getDb(),
  policy: ThrottlePolicy = DEFAULT_THROTTLE,
): LoginThrottleRepository {
  const windowStart = () =>
    new Date(Date.now() - policy.windowMinutes * 60 * 1_000)

  async function countFailures(scope: LoginScope, email?: string, ip?: string | null) {
    const conditions = [
      eq(loginAttempts.scope, scope),
      eq(loginAttempts.succeeded, false),
      gte(loginAttempts.createdAt, windowStart()),
    ]
    if (email !== undefined) conditions.push(eq(loginAttempts.email, email))
    if (ip !== undefined && ip !== null) conditions.push(eq(loginAttempts.ip, ip))

    const [row] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(loginAttempts)
      .where(and(...conditions))
    return Number(row?.total ?? 0)
  }

  return {
    async record({ scope, email, ip, succeeded }) {
      await db.insert(loginAttempts).values({
        scope,
        email: email.trim().toLowerCase(),
        ip: ip ?? null,
        succeeded,
      })
    },

    async clearFailures(scope, email) {
      await db
        .delete(loginAttempts)
        .where(
          and(
            eq(loginAttempts.scope, scope),
            eq(loginAttempts.email, email.trim().toLowerCase()),
            eq(loginAttempts.succeeded, false),
          ),
        )
    },

    async assertAllowed({ scope, email, ip }) {
      const normalized = email.trim().toLowerCase()
      const emailFailures = await countFailures(scope, normalized)
      const ipFailures = ip ? await countFailures(scope, undefined, ip) : 0

      const decision = evaluateLoginThrottle({ emailFailures, ipFailures }, policy)
      if (!decision.allowed) {
        // Mismo mensaje para ambos casos: no se revela si el email existe ni
        // desde qué dimensión se ha bloqueado.
        throw new AppError(
          'RATE_LIMITED',
          `Demasiados intentos fallidos. Vuelva a intentarlo en ${policy.windowMinutes} minutos.`,
        )
      }
      return decision
    },
  }
}
