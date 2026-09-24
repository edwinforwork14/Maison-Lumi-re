/**
 * Runner de las pruebas de integración contra una base **separada**.
 *
 * Los servicios de la app usan `getDb()`, que lee `DATABASE_URL`: por eso este
 * envoltorio sustituye esa variable por la de pruebas (`DATABASE_URL_TEST`) y
 * arranca el runner. Así los tests no ensucian la base de la tienda, que era
 * justo lo que hacía que el catálogo acabara con cientos de productos de prueba.
 */
import { spawn } from 'node:child_process'

const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL
if (!url) {
  console.error(
    'Falta DATABASE_URL_TEST (o DATABASE_URL). Crea una base aparte y aplica las migraciones:\n' +
      '  docker exec ml-postgres psql -U ml -d postgres -c "CREATE DATABASE maison_lumiere_test OWNER ml"\n' +
      '  DATABASE_URL=postgres://…/maison_lumiere_test npm run db:migrate',
  )
  process.exit(1)
}
if (!process.env.DATABASE_URL_TEST) {
  console.warn(
    '[test:db] DATABASE_URL_TEST no está definida: se usará DATABASE_URL y las pruebas escribirán en la base de la app.',
  )
}

/** Prepara la base de pruebas (semillas idempotentes) antes de ejecutar los tests. */
function seed(url) {
  return new Promise((resolve) => {
    const seeder = spawn(
      process.execPath,
      ['--experimental-strip-types', 'scripts/db-seed.mjs'],
      { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } },
    )
    seeder.on('exit', (code) => resolve(code ?? 1))
  })
}

const seedCode = await seed(url)
if (seedCode !== 0) {
  console.error('[test:db] las semillas fallaron; se aborta para no probar sobre datos incompletos')
  process.exit(seedCode)
}

const child = spawn(
  process.execPath,
  ['--test', '--experimental-strip-types', 'tests/db/*.test.ts'],
  { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } },
)
child.on('exit', (code) => process.exit(code ?? 1))