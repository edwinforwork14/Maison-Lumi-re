/**
 * Punto de entrada del seed (plan 01 §7: «Operación: `npm run db:migrate`,
 * `db:seed`, `db:studio`»).
 *
 * - `seedDatabase(db)` es la función reutilizable: la usan el script
 *   (`scripts/db-seed.mjs`) y los tests de integración, que siembran dos veces
 *   seguidas para comprobar la idempotencia.
 * - `main()` crea el cliente desde `DATABASE_URL`, siembra e informa. Sólo se
 *   ejecuta si este módulo **es** el punto de entrada (`node src/server/db/seed/index.ts`),
 *   nunca al importarlo.
 */

import { pathToFileURL } from 'node:url'
import { closeDb, createDbClient, requireDatabaseUrl, type Database } from '../client.ts'
import { seedCatalog, type SeedOptions, type SeedSummary } from './catalog.ts'
import { seedRbac } from './rbac.ts'
import { seedProductMedia } from './media.ts'
import { seedProductAttributes } from './attributes.ts'
import { seedDevCustomer } from './customers.ts'

export {
  DEV_ADMIN_EMAIL,
  DEV_ADMIN_PASSWORD,
  SITE_SETTING_SEEDS,
  deterministicId,
  devPasswordSalt,
  hashPassword,
  seedCatalog,
  verifyPassword,
} from './catalog.ts'
export type { SeedOptions, SeedSummary } from './catalog.ts'

/** Alias estable para scripts y tests: siembra sobre cualquier cliente. */
export async function seedDatabase(
  db: Database,
  options: SeedOptions = {},
): Promise<SeedSummary> {
  const summary = await seedCatalog(db, options)
  // Los atributos y las imágenes van después del catálogo: necesitan sus filas.
  await seedDevCustomer(db)
  await seedProductAttributes(db)
  await seedProductMedia(db)
  // El catálogo de permisos y los cinco roles del Plan 02: sin esto el panel
  // daría FORBIDDEN incluso al super administrador.
  await seedRbac(db)
  return summary
}

/** Resumen legible: una línea por tabla, siempre sin credenciales. */
function formatSummary(summary: SeedSummary): string {
  const lines = [
    'categories',
    'collections',
    'products',
    'variants',
    'inventoryItems',
    'shippingMethods',
    'taxRates',
    'siteSettings',
    'users',
    'roles',
  ] as const
  const width = Math.max(...lines.map((line) => line.length))
  return lines
    .map((line) => `  ${line.padEnd(width)}  ${summary[line]}`)
    .join('\n')
}

/**
 * Siembra la base apuntada por `DATABASE_URL` y cierra el pool. Devuelve el
 * resumen para que un test pueda comprobarlo sin volver a consultar.
 */
export async function main(): Promise<SeedSummary> {
  const db = createDbClient(requireDatabaseUrl())
  try {
    const summary = await seedDatabase(db)
    console.log('[db:seed] semillas aplicadas (idempotentes):')
    console.log(formatSummary(summary))
    return summary
  } finally {
    await closeDb()
  }
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined
if (entryPoint === import.meta.url) {
  await main()
}
