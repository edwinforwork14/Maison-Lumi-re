import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '../../src/server/db/schema/index.ts'
import {
  createPostgresLoginThrottle,
  evaluateLoginThrottle,
  DEFAULT_THROTTLE,
  type ThrottlePolicy,
} from '../../src/server/services/admin/login-throttle.ts'

/**
 * Ronda de seguridad del Plan 02 §3: el login del panel tiene que ser caro de
 * atacar. Aquí se prueban los umbrales (política pura) y los contadores reales
 * en base de datos, incluida la ventana temporal y el reinicio al acertar.
 */

const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL
if (!url) console.warn('[tests/db/login-throttle] DATABASE_URL no definida: suite omitida.')
const suite = url ? describe : describe.skip

describe('limitador: política pura', () => {
  const policy: ThrottlePolicy = {
    maxFailuresPerEmail: 3,
    maxFailuresPerIp: 5,
    windowMinutes: 10,
  }

  it('permite mientras no se alcanza el umbral', () => {
    assert.equal(
      evaluateLoginThrottle({ emailFailures: 0, ipFailures: 0 }, policy).allowed,
      true,
    )
    assert.equal(
      evaluateLoginThrottle({ emailFailures: 2, ipFailures: 4 }, policy).allowed,
      true,
    )
  })

  it('bloquea al llegar al umbral por email', () => {
    const decision = evaluateLoginThrottle({ emailFailures: 3, ipFailures: 0 }, policy)
    assert.equal(decision.allowed, false)
    assert.equal(decision.blockedBy, 'email')
    assert.equal(decision.retryAfterSeconds, 600)
  })

  it('bloquea por IP aunque el email esté limpio', () => {
    const decision = evaluateLoginThrottle({ emailFailures: 0, ipFailures: 5 }, policy)
    assert.equal(decision.allowed, false)
    assert.equal(decision.blockedBy, 'ip')
  })

  it('el umbral por email es más estricto que el de IP', () => {
    assert.ok(DEFAULT_THROTTLE.maxFailuresPerEmail < DEFAULT_THROTTLE.maxFailuresPerIp)
  })
})

if (url) {
  const client = postgres(url, { max: 5, onnotice: () => {} })
  const db = drizzle(client, { schema })
  const policy: ThrottlePolicy = {
    maxFailuresPerEmail: 3,
    maxFailuresPerIp: 4,
    windowMinutes: 15,
  }
  const throttle = createPostgresLoginThrottle(db, policy)

  after(async () => {
    await client.end({ timeout: 5 })
  })

  before(async () => {
    await client`DELETE FROM login_attempts WHERE email LIKE 'throttle-%'`
  })

  const token = () => Math.random().toString(36).slice(2, 10)
  const emailOf = () => `throttle-${token()}@example.com`

  suite('limitador: contadores en base de datos', () => {
    it('bloquea el email tras los fallos configurados, con RATE_LIMITED', async () => {
      const email = emailOf()
      const ip = `10.0.0.${Math.floor(Math.random() * 200) + 1}`

      for (let i = 0; i < policy.maxFailuresPerEmail; i += 1) {
        await throttle.assertAllowed({ scope: 'admin', email, ip })
        await throttle.record({ scope: 'admin', email, ip, succeeded: false })
      }

      await assert.rejects(
        throttle.assertAllowed({ scope: 'admin', email, ip }),
        (error: unknown) => {
          const e = error as { code?: string; message?: string }
          assert.equal(e.code, 'RATE_LIMITED')
          assert.match(e.message ?? '', /Demasiados intentos/)
          return true
        },
      )
    })

    it('un acceso correcto reinicia la ventana del email', async () => {
      const email = emailOf()
      const ip = `10.1.0.${Math.floor(Math.random() * 200) + 1}`

      for (let i = 0; i < policy.maxFailuresPerEmail - 1; i += 1) {
        await throttle.record({ scope: 'admin', email, ip, succeeded: false })
      }
      await throttle.record({ scope: 'admin', email, ip, succeeded: true })
      await throttle.clearFailures('admin', email)

      await assert.doesNotReject(throttle.assertAllowed({ scope: 'admin', email, ip }))
    })

    it('los fallos fuera de la ventana no cuentan', async () => {
      const email = emailOf()
      const ip = `10.2.0.${Math.floor(Math.random() * 200) + 1}`
      const old = new Date(Date.now() - (policy.windowMinutes + 5) * 60 * 1_000)

      for (let i = 0; i < policy.maxFailuresPerEmail + 2; i += 1) {
        await client`
          INSERT INTO login_attempts (scope, email, ip, succeeded, created_at)
          VALUES ('admin', ${email}, ${ip}, false, ${old.toISOString()})`
      }

      // Sin segundo argumento: `assert.doesNotReject` espera un validador de
      // error, no un mensaje (pasar un string hacía fallar la aserción).
      await assert.doesNotReject(throttle.assertAllowed({ scope: 'admin', email, ip }))
    })

    it('bloquea por IP cuando se falla contra muchas cuentas distintas', async () => {
      const ip = `10.3.0.${Math.floor(Math.random() * 200) + 1}`
      for (let i = 0; i < policy.maxFailuresPerIp; i += 1) {
        await throttle.record({ scope: 'admin', email: emailOf(), ip, succeeded: false })
      }

      await assert.rejects(
        throttle.assertAllowed({ scope: 'admin', email: emailOf(), ip }),
        (error: unknown) => (error as { code?: string }).code === 'RATE_LIMITED',
      )
    })

    it('los ámbitos no se mezclan: agotar la tienda no bloquea el panel', async () => {
      const email = emailOf()
      const ip = `10.4.0.${Math.floor(Math.random() * 200) + 1}`
      for (let i = 0; i < policy.maxFailuresPerEmail; i += 1) {
        await throttle.record({ scope: 'storefront', email, ip, succeeded: false })
      }
      await assert.doesNotReject(throttle.assertAllowed({ scope: 'admin', email, ip }))
    })
  })
}
