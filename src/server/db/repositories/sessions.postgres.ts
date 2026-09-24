/**
 * Sesiones en PostgreSQL (plan 01 §4 `identity`, F4).
 *
 * Diseño de seguridad:
 * - El token que viaja en la cookie es aleatorio (32 bytes) y va **firmado con
 *   HMAC-SHA256** usando `SESSION_SECRET`: una cookie manipulada se rechaza sin
 *   llegar a tocar la base de datos.
 * - En la base **nunca** se guarda el token: se guarda su `sha256`. Quien lea la
 *   tabla no puede suplantar a nadie.
 * - La expiración vive en `expires_at` y se comprueba en cada resolución, así
 *   que revocar una sesión es inmediato (no hay JWT autocontenido que esperar).
 * - `kind` separa la sesión de tienda (`storefront`) de la de administración
 *   (`admin`), con TTL distinto: un panel no debe durar una semana.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { and, eq, gt, sql } from 'drizzle-orm'
import { AppError } from '../../errors.ts'
import { env } from '../../runtime/env.ts'
import { getDb, type Database } from '../client.ts'
import { sessions, users } from '../schema/identity.ts'

export type SessionKind = 'storefront' | 'admin'

export interface SessionRecord {
  readonly id: string
  readonly userId: string
  readonly kind: SessionKind
  readonly expiresAt: Date
}

export interface IssuedSession {
  /** Valor que va en la cookie: `<token>.<firma>`. */
  readonly cookieValue: string
  readonly record: SessionRecord
}

const TTL_SECONDS: Record<SessionKind, number> = {
  storefront: 60 * 60 * 24 * 7, // 7 días
  admin: 60 * 60 * 8, // 8 horas: el panel no se queda abierto una semana
}

const DEV_SECRET = 'dev-only-session-secret-no-usar-en-produccion-32'

/** Secreto de firma: obligatorio en producción, con aviso claro en desarrollo. */
export function resolveSessionSecret(explicit?: string): string {
  const secret = explicit ?? env.SESSION_SECRET
  if (secret && secret.length >= 32) return secret
  if (env.DATA_SOURCE === 'postgres' && !secret) {
    throw new AppError(
      'CONFIG',
      'SESSION_SECRET (mínimo 32 caracteres) es obligatorio cuando DATA_SOURCE=postgres.',
    )
  }
  return DEV_SECRET
}

const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex')

function sign(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('base64url')
}

/** Comparación en tiempo constante de dos firmas base64url. */
function sameSignature(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

export interface SessionsRepository {
  issue(input: {
    userId: string
    kind: SessionKind
    ttlSeconds?: number
    ip?: string | null
    userAgent?: string | null
  }): Promise<IssuedSession>
  resolve(cookieValue: string | null | undefined): Promise<SessionRecord | null>
  revoke(cookieValue: string | null | undefined): Promise<void>
  revokeAllForUser(userId: string): Promise<number>
}

export function createPostgresSessionsRepository(
  db: Database = getDb(),
  secret: string = resolveSessionSecret(),
): SessionsRepository {
  return {
    async issue({ userId, kind, ttlSeconds, ip, userAgent }) {
      const token = randomBytes(32).toString('base64url')
      const expiresAt = new Date(
        Date.now() + (ttlSeconds ?? TTL_SECONDS[kind]) * 1_000,
      )

      const [row] = await db
        .insert(sessions)
        .values({
          userId,
          kind,
          tokenHash: hashToken(token),
          expiresAt,
          ip: ip ?? null,
          userAgent: userAgent ?? null,
        })
        .returning({ id: sessions.id })

      return {
        cookieValue: `${token}.${sign(token, secret)}`,
        record: { id: row!.id, userId, kind, expiresAt },
      }
    },

    async resolve(cookieValue) {
      if (!cookieValue) return null
      const separator = cookieValue.lastIndexOf('.')
      if (separator <= 0) return null

      const token = cookieValue.slice(0, separator)
      const signature = cookieValue.slice(separator + 1)
      if (!sameSignature(signature, sign(token, secret))) return null

      const [row] = await db
        .select({
          id: sessions.id,
          userId: sessions.userId,
          kind: sessions.kind,
          expiresAt: sessions.expiresAt,
        })
        .from(sessions)
        .where(
          and(
            eq(sessions.tokenHash, hashToken(token)),
            gt(sessions.expiresAt, new Date()),
          ),
        )
        .limit(1)

      if (!row) return null
      return {
        id: row.id,
        userId: row.userId,
        kind: row.kind === 'admin' ? 'admin' : 'storefront',
        expiresAt: row.expiresAt,
      }
    },

    async revoke(cookieValue) {
      if (!cookieValue) return
      const separator = cookieValue.lastIndexOf('.')
      if (separator <= 0) return
      const token = cookieValue.slice(0, separator)
      await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)))
    },

    async revokeAllForUser(userId) {
      const rows = await db
        .delete(sessions)
        .where(eq(sessions.userId, userId))
        .returning({ id: sessions.id })
      return rows.length
    },
  }
}

/**
 * Usuarios activos por email, para el login. La comparación se hace sobre
 * `lower(email)`, igual que el índice único: el mismo email en distinto caso es
 * la misma persona.
 */
export async function findActiveUserByEmail(
  email: string,
  db: Database = getDb(),
): Promise<{ id: string; email: string; passwordHash: string } | null> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return null
  const [row] = await db
    .select({ id: users.id, email: users.email, passwordHash: users.passwordHash })
    .from(users)
    .where(and(sql`lower(${users.email}) = ${normalized}`, eq(users.status, 'active')))
    .limit(1)
  return row ?? null
}
