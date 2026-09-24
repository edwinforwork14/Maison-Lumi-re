/**
 * Contenedor de composición (plan 01 §4.4): **el único punto** donde se decide
 * qué adaptador se usa. Ni los servicios ni las rutas conocen la fuente de
 * datos; aquí se traduce `DATA_SOURCE` a implementaciones concretas.
 *
 *   DATA_SOURCE=in-memory → adaptadores en memoria (desarrollo, tests, demo)
 *   DATA_SOURCE=postgres  → adaptadores PostgreSQL (producción)
 *
 * Nota de estado: durante la migración strangler la app sigue sirviendo el
 * catálogo, los pedidos y las sesiones con los servicios en memoria de
 * `src/server/services/**`. Este contenedor ya expone los adaptadores nuevos
 * (inventario y checkout) y es lo que consumen los tests de integración; el
 * traslado del resto de puertos es el siguiente incremento del plan 01.
 */

import { AppError } from '../errors.ts'
import { canUseDatabase } from '../db/client.ts'
import { isPostgresDataSource } from './env.ts'
import { createInMemoryInventoryRepository } from '../db/repositories/inventory.in-memory.ts'
import { createPostgresInventoryRepository } from '../db/repositories/inventory.postgres.ts'
import { placeOrderTransactional } from '../db/repositories/orders.postgres.ts'
import type { InventoryRepository } from '../db/repositories/inventory.port.ts'
import type { PlaceOrderInput, PlacedOrder } from '../db/repositories/orders.postgres.ts'

export interface CheckoutRepository {
  place(input: PlaceOrderInput): Promise<PlacedOrder>
}

export interface DataAdapters {
  readonly source: 'in-memory' | 'postgres'
  readonly inventory: InventoryRepository
  readonly checkout: CheckoutRepository
}

/**
 * Adaptadores de PostgreSQL. Exige `DATABASE_URL`: sin ella el error es de
 * configuración y se explica solo (`CONFIG`), nunca un fallo críptico.
 */
export function postgresAdapters(): DataAdapters {
  if (!canUseDatabase()) {
    throw new AppError(
      'CONFIG',
      'DATA_SOURCE=postgres requiere DATABASE_URL (o usa DATA_SOURCE=in-memory).',
    )
  }
  return {
    source: 'postgres',
    inventory: createPostgresInventoryRepository(),
    checkout: {
      place: (input) => placeOrderTransactional(input),
    },
  }
}

/**
 * Adaptadores en memoria. El checkout en memoria sigue siendo el servicio
 * clásico (no toca base de datos); el inventario en memoria arranca vacío y se
 * puebla desde las semillas cuando el llamador lo necesite.
 */
export function inMemoryAdapters(): DataAdapters {
  return {
    source: 'in-memory',
    inventory: createInMemoryInventoryRepository(),
    checkout: {
      place: async () => {
        throw new AppError(
          'CONFIG',
          'El checkout transaccional exige DATA_SOURCE=postgres; en memoria usa el servicio de commerce.',
        )
      },
    },
  }
}

/** Adaptadores activos según el entorno. */
export function getAdapters(): DataAdapters {
  return isPostgresDataSource() ? postgresAdapters() : inMemoryAdapters()
}
