/**
 * Semilla de la cuenta de cliente de desarrollo.
 *
 * El E2E entra con esta cuenta para comprobar el área de cliente. Antes vivía
 * sólo en memoria (`session/store.ts`), así que al pasar la tienda a PostgreSQL
 * la cuenta tenía que existir también en la base.
 *
 * La contraseña es de desarrollo y está documentada como tal: nunca se usa un
 * secreto real en una semilla.
 */

import { eq, sql } from 'drizzle-orm'
import { getDb, type Database } from '../client.ts'
import { customers, users } from '../schema/identity.ts'
import { hashPassword } from '../../runtime/password-hasher.ts'

export const DEV_CUSTOMER_EMAIL = 'demo@maisonlumiere.es'
export const DEV_CUSTOMER_PASSWORD = 'demo1234'

export interface CustomerSeedResult {
  readonly users: number
  readonly customers: number
}

export async function seedDevCustomer(db: Database = getDb()): Promise<CustomerSeedResult> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${DEV_CUSTOMER_EMAIL}`)
    .limit(1)

  const userId =
    existing?.id ??
    (
      await db
        .insert(users)
        .values({
          email: DEV_CUSTOMER_EMAIL,
          passwordHash: hashPassword(DEV_CUSTOMER_PASSWORD),
          status: 'active',
        })
        .returning({ id: users.id })
    )[0]!.id

  // La ficha de cliente se crea una sola vez (no se pisa el nombre real).
  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.userId, userId))
    .limit(1)

  let created = 0
  if (!customer) {
    await db.insert(customers).values({
      userId,
      firstName: 'Demo',
      lastName: 'Maison',
      phone: null,
    })
    created = 1
  }

  return { users: existing ? 0 : 1, customers: created }
}
