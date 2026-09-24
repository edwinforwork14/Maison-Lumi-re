/**
 * Autenticación de la tienda sobre PostgreSQL (Fase 3 del Plan 03).
 *
 * Sustituye el almacén en memoria de `src/server/session/store.ts`, que usaba un
 * «hasher» de desarrollo en base64 y perdía las cuentas al reiniciar. Aquí:
 *
 * - La contraseña se guarda con `scrypt` y sal aleatoria (`password-hasher`).
 * - La sesión vive en la tabla `sessions` con `kind = 'storefront'`, así que
 *   reiniciar el proceso no cierra la sesión de nadie.
 * - El teléfono/correo no se duplican: la identidad está en `users` y el nombre
 *   en `customers`.
 * - El limitador de intentos ya probado se aplica también a este ámbito.
 */

import { eq, sql } from 'drizzle-orm'
import { getDb, type Database } from '../db/client.ts'
import { customers, users } from '../db/schema/identity.ts'
import {
  createPostgresSessionsRepository,
  findActiveUserByEmail,
  type SessionRecord,
} from '../db/repositories/sessions.postgres.ts'
import { createPostgresLoginThrottle } from './admin/login-throttle.ts'
import { hashPassword, verifyPassword } from '../runtime/password-hasher.ts'
import { AppError } from '../errors.ts'

export interface StorefrontUser {
  readonly id: string
  readonly firstName: string
  readonly lastName: string
  readonly email: string
}

export interface StorefrontAuthContext {
  readonly ip?: string | null
}

const SCOPE = 'storefront' as const

const normalize = (email: string) => email.trim().toLowerCase()

/** Datos de la cuenta a partir del usuario y su ficha de cliente. */
async function loadStorefrontUser(
  userId: string,
  db: Database,
): Promise<StorefrontUser | null> {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: customers.firstName,
      lastName: customers.lastName,
    })
    .from(users)
    .leftJoin(customers, eq(customers.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1)
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName ?? '',
    lastName: row.lastName ?? '',
  }
}

export interface StorefrontAuthService {
  register(input: {
    firstName: string
    lastName: string
    email: string
    password: string
    context?: StorefrontAuthContext
  }): Promise<StorefrontUser>
  login(input: {
    email: string
    password: string
    context?: StorefrontAuthContext
  }): Promise<StorefrontUser>
  /** Usuario de una sesión válida, o `null` si no hay sesión utilizable. */
  currentUser(sessionId: string | null): Promise<StorefrontUser | null>
}

export function createPostgresStorefrontAuth(db: Database = getDb()): StorefrontAuthService {
  const throttle = createPostgresLoginThrottle(db)

  return {
    async register({ firstName, lastName, email, password, context }) {
      const normalized = normalize(email)
      if (!/^\S+@\S+\.\S+$/.test(normalized)) {
        throw new AppError('VALIDATION', 'Introduzca un email válido')
      }
      if (password.length < 8) {
        throw new AppError('VALIDATION', 'La contraseña debe tener al menos 8 caracteres')
      }

      return db.transaction(async (tx) => {
        const existing = await tx
          .select({ id: users.id })
          .from(users)
          .where(sql`lower(${users.email}) = ${normalized}`)
          .limit(1)
        if (existing.length > 0) {
          throw new AppError('CONFLICT', 'Ya existe una cuenta con este email')
        }

        const [user] = await tx
          .insert(users)
          .values({ email: normalized, passwordHash: hashPassword(password) })
          .returning({ id: users.id })

        await tx.insert(customers).values({
          userId: user!.id,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        })

        await throttle.record({
          scope: SCOPE,
          email: normalized,
          ip: context?.ip ?? null,
          succeeded: true,
        })

        return { id: user!.id, firstName: firstName.trim(), lastName: lastName.trim(), email: normalized }
      })
    },

    async login({ email, password, context }) {
      const normalized = normalize(email)

      // Igual que en el panel: se comprueba el límite ANTES de gastar el hasher.
      await throttle.assertAllowed({ scope: SCOPE, email: normalized, ip: context?.ip ?? null })

      const user = await findActiveUserByEmail(normalized, db)
      if (!user || !verifyPassword(password, user.passwordHash)) {
        await throttle.record({
          scope: SCOPE,
          email: normalized,
          ip: context?.ip ?? null,
          succeeded: false,
        })
        throw new AppError('UNAUTHENTICATED', 'Credenciales incorrectas')
      }

      await throttle.record({
        scope: SCOPE,
        email: normalized,
        ip: context?.ip ?? null,
        succeeded: true,
      })
      await throttle.clearFailures(SCOPE, normalized)

      const account = await loadStorefrontUser(user.id, db)
      if (!account) throw new AppError('NOT_FOUND', 'La cuenta no tiene ficha de cliente')
      return account
    },

    async currentUser(userId) {
      if (!userId) return null
      return loadStorefrontUser(userId, db)
    },
  }
}

/** Motivo por el que una sesión de tienda no se puede usar (sólo para logs). */
export type StorefrontSessionIssue = 'expired' | 'revoked' | 'unknown'

export function describeSessionIssue(record: SessionRecord | null): StorefrontSessionIssue {
  if (!record) return 'unknown'
  return record.expiresAt.getTime() <= Date.now() ? 'expired' : 'revoked'
}
