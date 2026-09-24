import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '../../src/server/db/schema/index.ts'
import {
  hashPassword,
  verifyPassword,
} from '../../src/server/runtime/password-hasher.ts'
import { createPostgresSessionsRepository } from '../../src/server/db/repositories/sessions.postgres.ts'
import {
  createPostgresRbacRepository,
  grantPermissionsToRole,
} from '../../src/server/db/repositories/rbac.postgres.ts'
import { createPostgresAuditRepository } from '../../src/server/db/repositories/audit.postgres.ts'

/**
 * Fase 4 del plan 01: identidad, RBAC y auditoría sobre PostgreSQL.
 *
 * Lo que se prueba aquí es lo que no puede probar un test unitario:
 * que una cookie manipulada no vale, que una sesión caducada no resuelve, que
 * un permiso ausente produce `FORBIDDEN` y que toda mutación sensible deja
 * traza en `audit_logs`.
 */

const url = process.env.DATABASE_URL
if (!url) {
  console.warn('[tests/db/auth] DATABASE_URL no definida: suite omitida. Usa `npm run test:db`.')
}
const suite = url ? describe : describe.skip

if (url) {
  const client = postgres(url, { max: 5, onnotice: () => {} })
  /** Los adaptadores esperan una instancia de Drizzle, no el cliente crudo. */
  const db = drizzle(client, { schema })
  after(async () => {
    await client.end({ timeout: 5 })
  })

  const token = () => Math.random().toString(36).slice(2, 10)
  const SECRET = 'secreto-de-pruebas-con-mas-de-32-caracteres-ok'

  async function createUser(password = 'Contraseña-Secreta-1'): Promise<string> {
    const t = token()
    const [row] = await client<{ id: string }[]>`
      INSERT INTO users (email, password_hash)
      VALUES (${`user-${t}@example.com`}, ${hashPassword(password)})
      RETURNING id`
    return row!.id
  }

  suite('password hasher: scrypt con sal aleatoria', () => {
    it('verifica la contraseña correcta y rechaza la incorrecta', () => {
      const stored = hashPassword('correcta-1234')
      assert.equal(verifyPassword('correcta-1234', stored), true)
      assert.equal(verifyPassword('correcta-1235', stored), false)
      assert.equal(verifyPassword('', stored), false)
    })

    it('dos hashes de la misma contraseña son distintos (sal por contraseña)', () => {
      const a = hashPassword('misma-contraseña')
      const b = hashPassword('misma-contraseña')
      assert.notEqual(a, b)
      assert.equal(verifyPassword('misma-contraseña', a), true)
      assert.equal(verifyPassword('misma-contraseña', b), true)
    })

    it('no lanza ante un hash corrupto o vacío: devuelve false', () => {
      for (const bad of ['', 'no-es-un-hash', '$scrypt$N=0,r=0,p=0$xx$yy', null, undefined]) {
        assert.equal(verifyPassword('x', bad as string), false)
      }
    })

    it('el hash no contiene la contraseña en claro', () => {
      const stored = hashPassword('NoDebeAparecer123')
      assert.equal(stored.includes('NoDebeAparecer123'), false)
      assert.match(stored, /^\$scrypt\$N=\d+,r=\d+,p=\d+\$/)
    })
  })

  suite('sesiones: cookie firmada y caducidad', () => {
    it('emite, resuelve y revoca una sesión', async () => {
      const sessions = createPostgresSessionsRepository(db, SECRET)
      const userId = await createUser()

      const issued = await sessions.issue({ userId, kind: 'admin' })
      const resolved = await sessions.resolve(issued.cookieValue)
      assert.ok(resolved, 'la sesión recién emitida debe resolver')
      assert.equal(resolved!.userId, userId)
      assert.equal(resolved!.kind, 'admin')

      await sessions.revoke(issued.cookieValue)
      assert.equal(await sessions.resolve(issued.cookieValue), null)
    })

    it('rechaza una cookie manipulada sin tocar la base de datos', async () => {
      const sessions = createPostgresSessionsRepository(db, SECRET)
      const userId = await createUser()
      const issued = await sessions.issue({ userId, kind: 'storefront' })

      const [tokenPart, signature] = issued.cookieValue.split('.') as [string, string]
      // 1) firma alterada  2) token alterado con firma vieja  3) sin firma
      assert.equal(await sessions.resolve(`${tokenPart}.${signature}x`), null)
      assert.equal(await sessions.resolve(`${tokenPart}x.${signature}`), null)
      assert.equal(await sessions.resolve(tokenPart), null)
      assert.equal(await sessions.resolve(null), null)

      // La sesión legítima sigue viva: no se ha consumido nada al rechazar.
      assert.ok(await sessions.resolve(issued.cookieValue))
    })

    it('una sesión caducada no resuelve', async () => {
      const sessions = createPostgresSessionsRepository(db, SECRET)
      const userId = await createUser()
      // TTL de 1 s y se espera: la fila sigue ahí, pero ya no vale.
      const issued = await sessions.issue({ userId, kind: 'storefront', ttlSeconds: 1 })
      assert.ok(await sessions.resolve(issued.cookieValue))
      await new Promise((resolve) => setTimeout(resolve, 1_200))
      assert.equal(await sessions.resolve(issued.cookieValue), null)
    })

    it('la base impide emitir una sesión ya caducada', async () => {
      const sessions = createPostgresSessionsRepository(db, SECRET)
      const userId = await createUser()
      await assert.rejects(
        sessions.issue({ userId, kind: 'storefront', ttlSeconds: -60 }),
        /sessions_expires_after_created|expires_at/,
      )
    })

    it('en la tabla nunca se guarda el token en claro', async () => {
      const sessions = createPostgresSessionsRepository(db, SECRET)
      const userId = await createUser()
      const issued = await sessions.issue({ userId, kind: 'storefront' })
      const rawToken = issued.cookieValue.split('.')[0]!

      const rows = await client<{ token_hash: string }[]>`
        SELECT token_hash FROM sessions WHERE user_id = ${userId}`
      assert.equal(rows.length, 1)
      assert.notEqual(rows[0]!.token_hash, rawToken)
      assert.match(rows[0]!.token_hash, /^[0-9a-f]{64}$/)
    })

    it('revokeAllForUser cierra todas las sesiones del usuario', async () => {
      const sessions = createPostgresSessionsRepository(db, SECRET)
      const userId = await createUser()
      await sessions.issue({ userId, kind: 'storefront' })
      await sessions.issue({ userId, kind: 'admin' })
      assert.equal(await sessions.revokeAllForUser(userId), 2)
    })
  })

  suite('RBAC: el permiso se comprueba en el servidor', () => {
    it('concede permisos por rol y los hace efectivos', async () => {
      const rbac = createPostgresRbacRepository(db)
      const userId = await createUser()
      const suffix = token()

      await grantPermissionsToRole({
        roleKey: `manager-${suffix}`,
        permissions: [`products:write-${suffix}`, `orders:refund-${suffix}`],
        userId,
      })

      const granted = await rbac.permissionsForUser(userId)
      assert.ok(granted.includes(`products:write-${suffix}`))
      assert.ok(await rbac.hasPermission(userId, `orders:refund-${suffix}`))
      await assert.doesNotReject(rbac.requirePermission(userId, `products:write-${suffix}`))
    })

    it('sin permiso lanza FORBIDDEN y no revela detalles', async () => {
      const rbac = createPostgresRbacRepository(db)
      const userId = await createUser()

      assert.equal(await rbac.hasPermission(userId, 'users:manage'), false)
      await assert.rejects(rbac.requirePermission(userId, 'users:manage'), (error: unknown) => {
        const e = error as { code?: string; message?: string }
        assert.equal(e.code, 'FORBIDDEN')
        assert.equal(e.message, 'No tiene permiso para esta operación')
        return true
      })
    })

    it('un permiso inexistente no concede nada', async () => {
      const rbac = createPostgresRbacRepository(db)
      const userId = await createUser()
      assert.equal(await rbac.hasPermission(userId, `inventado:${token()}`), false)
    })
  })

  suite('auditoría: toda mutación sensible deja traza', () => {
    it('registra la acción con before/after y permite consultarla', async () => {
      const audit = createPostgresAuditRepository(db)
      const actorId = await createUser()
      const entityId = crypto.randomUUID()

      const id = await audit.record({
        actorId,
        actorKind: 'user',
        action: 'inventory.adjust',
        entity: 'inventory_items',
        entityId,
        before: { onHand: 10 },
        after: { onHand: 12 },
        requestId: 'req-123',
        ip: '127.0.0.1',
      })
      assert.match(id, /^[0-9a-f-]{36}$/)

      const history = await audit.listByEntity('inventory_items', entityId)
      assert.equal(history.length, 1)
      assert.equal(history[0]!.action, 'inventory.adjust')
      assert.equal(history[0]!.actorKind, 'user')
    })

    it('exige acción y entidad', async () => {
      const audit = createPostgresAuditRepository(db)
      await assert.rejects(
        audit.record({ actorKind: 'system', action: '  ', entity: 'products' }),
        /action.*entity|exige/i,
      )
      await assert.rejects(
        audit.record({ actorKind: 'system', action: 'product.update', entity: '' }),
        /action.*entity|exige/i,
      )
    })

    it('rechaza un tipo de actor desconocido (lo impide la base)', async () => {
      const audit = createPostgresAuditRepository(db)
      await assert.rejects(
        audit.record({
          actorKind: 'robot' as never,
          action: 'product.update',
          entity: 'products',
        }),
        /actor_kind/,
      )
    })
  })
}
