import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '../../src/server/db/schema/index.ts'
import { createPostgresStorefrontAuth } from '../../src/server/services/storefront-auth.ts'
import { createPostgresSessionsRepository } from '../../src/server/db/repositories/sessions.postgres.ts'
import { verifyPassword } from '../../src/server/runtime/password-hasher.ts'

/**
 * Fase 3: la cuenta de la tienda vive en PostgreSQL (defectos D40/D41).
 *
 * Antes: contraseñas en base64 reversible y sesiones en un `Map` que se perdían
 * al reiniciar. Ahora: `scrypt` con sal, fila en `users` + `customers` y sesión
 * en la tabla `sessions`.
 */

const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL
if (!url) console.warn('[tests/db/storefront-auth] DATABASE_URL no definida: suite omitida.')
const suite = url ? describe : describe.skip

if (url) {
  const client = postgres(url, { max: 5, onnotice: () => {} })
  const db = drizzle(client, { schema })
  const auth = createPostgresStorefrontAuth(db)
  const SECRET = 'secreto-de-pruebas-tienda-con-mas-de-32-caracteres'

  after(async () => {
    await client.end({ timeout: 5 })
  })

  const token = () => Math.random().toString(36).slice(2, 10)
  const emailOf = () => `cliente-${token()}@example.com`

  suite('registro en la tienda', () => {
    it('crea la cuenta con hash scrypt y su ficha de cliente', async () => {
      const email = emailOf()
      const account = await auth.register({
        firstName: 'Ana',
        lastName: 'García',
        email,
        password: 'Contraseña-Larga-1',
      })
      assert.equal(account.email, email)

      const [row] = await client<{ password_hash: string; status: string }[]>`
        SELECT password_hash, status FROM users WHERE email = ${email}`
      assert.ok(row)
      assert.equal(row!.status, 'active')
      assert.match(row!.password_hash, /^\$scrypt\$/)
      assert.equal(row!.password_hash.includes('Contraseña-Larga-1'), false)
      assert.equal(verifyPassword('Contraseña-Larga-1', row!.password_hash), true)
      assert.equal(verifyPassword('otra', row!.password_hash), false)

      const [customer] = await client<{ first_name: string; last_name: string }[]>`
        SELECT c.first_name, c.last_name FROM customers c
        JOIN users u ON u.id = c.user_id WHERE u.email = ${email}`
      assert.equal(customer!.first_name, 'Ana')
      assert.equal(customer!.last_name, 'García')
    })

    it('rechaza un email ya registrado, sin importar mayúsculas', async () => {
      const email = emailOf()
      await auth.register({ firstName: 'A', lastName: 'B', email, password: 'Contraseña-Larga-1' })
      await assert.rejects(
        auth.register({
          firstName: 'C',
          lastName: 'D',
          email: email.toUpperCase(),
          password: 'Contraseña-Larga-1',
        }),
        (error: unknown) => (error as { code?: string }).code === 'CONFLICT',
      )
    })

    it('exige contraseña de longitud razonable y email válido', async () => {
      await assert.rejects(
        auth.register({ firstName: 'A', lastName: 'B', email: emailOf(), password: 'corta' }),
        (error: unknown) => (error as { code?: string }).code === 'VALIDATION',
      )
      await assert.rejects(
        auth.register({ firstName: 'A', lastName: 'B', email: 'no-es-email', password: 'Contraseña-Larga-1' }),
        (error: unknown) => (error as { code?: string }).code === 'VALIDATION',
      )
    })
  })

  suite('acceso en la tienda', () => {
    it('acepta la contraseña correcta y devuelve la cuenta', async () => {
      const email = emailOf()
      await auth.register({ firstName: 'Luz', lastName: 'Sol', email, password: 'Contraseña-Larga-1' })
      const account = await auth.login({ email, password: 'Contraseña-Larga-1' })
      assert.equal(account.firstName, 'Luz')
      assert.equal(account.email, email)
    })

    it('rechaza la contraseña incorrecta', async () => {
      const email = emailOf()
      await auth.register({ firstName: 'Luz', lastName: 'Sol', email, password: 'Contraseña-Larga-1' })
      await assert.rejects(
        auth.login({ email, password: 'Contraseña-Larga-2' }),
        (error: unknown) => (error as { code?: string }).code === 'UNAUTHENTICATED',
      )
    })

    it('una cuenta desactivada no puede entrar', async () => {
      const email = emailOf()
      await auth.register({ firstName: 'Luz', lastName: 'Sol', email, password: 'Contraseña-Larga-1' })
      await client`UPDATE users SET status = 'disabled' WHERE email = ${email}`
      await assert.rejects(
        auth.login({ email, password: 'Contraseña-Larga-1' }),
        (error: unknown) => (error as { code?: string }).code === 'UNAUTHENTICATED',
      )
    })

    it('la sesión emitida es de tienda, resuelve y se revoca', async () => {
      const email = emailOf()
      const account = await auth.register({
        firstName: 'Luz',
        lastName: 'Sol',
        email,
        password: 'Contraseña-Larga-1',
      })
      const sessions = createPostgresSessionsRepository(db, SECRET)
      const issued = await sessions.issue({ userId: account.id, kind: 'storefront' })

      const resolved = await sessions.resolve(issued.cookieValue)
      assert.ok(resolved)
      assert.equal(resolved!.kind, 'storefront')
      assert.equal(resolved!.userId, account.id)

      // La cuenta se recupera a partir del usuario de la sesión.
      const current = await auth.currentUser(resolved!.userId)
      assert.equal(current?.email, email)

      await sessions.revoke(issued.cookieValue)
      assert.equal(await sessions.resolve(issued.cookieValue), null)
    })

    it('la sesión sobrevive a un cliente nuevo (no vive en memoria)', async () => {
      const email = emailOf()
      const account = await auth.register({
        firstName: 'Luz',
        lastName: 'Sol',
        email,
        password: 'Contraseña-Larga-1',
      })
      const sessions = createPostgresSessionsRepository(db, SECRET)
      const issued = await sessions.issue({ userId: account.id, kind: 'storefront' })

      // Otro proceso (otra conexión) ve la misma sesión: es persistente.
      const otherClient = postgres(url!, { max: 2, onnotice: () => {} })
      const otherDb = drizzle(otherClient, { schema })
      const otherSessions = createPostgresSessionsRepository(otherDb, SECRET)
      const resolved = await otherSessions.resolve(issued.cookieValue)
      assert.equal(resolved?.userId, account.id)
      await otherClient.end({ timeout: 5 })
    })
  })
}
