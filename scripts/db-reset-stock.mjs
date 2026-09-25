import { closeDb, getSqlClient, requireDatabaseUrl } from '../src/server/db/client.ts'

requireDatabaseUrl()
if (process.env.NODE_ENV === 'production') {
  console.error('[db:reset-stock] Rechazado: NODE_ENV=production')
  process.exit(1)
}

// Cliente crudo: son varias sentencias y `unsafe` las envía tal cual.
// El orden respeta las claves foráneas: `idempotency_keys` y `order_items`
// referencian a `orders` con RESTRICT.
const client = getSqlClient()
await client.unsafe(`
  UPDATE inventory_items SET reserved = 0;
  DELETE FROM inventory_reservations;
  DELETE FROM idempotency_keys;
  DELETE FROM order_items;
  DELETE FROM orders;
`)

console.log(
  '[db:reset-stock] reservas liberadas y pedidos de prueba eliminados. Ya puedes ejecutar el E2E.',
)
await closeDb()
