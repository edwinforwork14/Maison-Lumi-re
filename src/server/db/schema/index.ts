/**
 * Barril del esquema Drizzle (plan 01 §4). Es la única ruta que consume
 * `drizzle-kit` (`drizzle.config.ts` → `schema: 'src/server/db/schema/index.ts'`)
 * y el cliente de base de datos.
 *
 * Un archivo por dominio:
 * - `identity`   usuarios, clientes, sesiones, RBAC
 * - `catalog`    categorías, marcas, colecciones, productos, variantes, media
 * - `inventory`  existencias, reservas, ledger de movimientos
 * - `orders`     carrito, direcciones, pedidos, líneas, historial
 * - `payments`   pagos y eventos de proveedor
 * - `shipping`   métodos, zonas, impuestos, envíos
 * - `promotions` cupones y canjes
 * - `social`     reseñas y listas de deseos
 * - `content`    ajustes, secciones de portada, banners
 * - `ops`        auditoría e idempotencia
 */

export * from './identity.ts'
export * from './catalog.ts'
export * from './inventory.ts'
export * from './orders.ts'
export * from './payments.ts'
export * from './shipping.ts'
export * from './promotions.ts'
export * from './social.ts'
export * from './content.ts'
export * from './ops.ts'
