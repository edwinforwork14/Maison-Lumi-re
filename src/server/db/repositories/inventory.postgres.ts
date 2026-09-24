/**
 * Adaptador de inventario sobre PostgreSQL (plan 01 §5–§6): el que garantiza
 * de verdad que no hay sobreventa.
 *
 * Cómo lo consigue:
 * - Cada operación abre una transacción y bloquea las filas implicadas con
 *   `SELECT … FOR UPDATE` **ordenadas por `variant_id`** (§6: el orden evita
 *   deadlocks cuando un pedido toca varias variantes).
 * - Reservar valida **todas** las líneas antes de aplicar ninguna: una reserva
 *   parcial es imposible.
 * - Cada cambio de `on_hand` escribe su `inventory_movements` en la MISMA
 *   transacción (§5.3): sin movimiento no hay cambio.
 */

import { and, eq, inArray, sql } from 'drizzle-orm'
import { AppError } from '../../errors.ts'
import { getDb, type Database } from '../client.ts'
import {
  inventoryItems,
  inventoryMovements,
  inventoryReservations,
} from '../schema/inventory.ts'
import {
  InsufficientStockError,
  type AdjustInput,
  type InventoryRepository,
  type Reservation,
  type StockLine,
  type StockSnapshot,
} from './inventory.port.ts'

type Db = Database
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

function toSnapshot(row: {
  variantId: string
  onHand: number
  reserved: number
}): StockSnapshot {
  return {
    variantId: row.variantId,
    onHand: row.onHand,
    reserved: row.reserved,
    available: row.onHand - row.reserved,
  }
}

/**
 * Bloquea las filas de existencias de las variantes indicadas, en orden
 * estable, y las devuelve.
 */
async function lockItems(tx: Tx, variantIds: readonly string[]) {
  if (variantIds.length === 0) return []
  return tx
    .select()
    .from(inventoryItems)
    .where(inArray(inventoryItems.variantId, [...variantIds]))
    .orderBy(inventoryItems.variantId)
    .for('update')
}

/**
 * Reserva dentro de una transacción ya abierta. Existe para que el checkout
 * pueda reservar stock y crear el pedido en la MISMA transacción (plan §6):
 * o queda todo, o no queda nada. No abre transacción propia a propósito.
 */
export async function reserveWithinTx(
  tx: Tx,
  orderId: string,
  lines: readonly StockLine[],
  ttlSeconds: number,
): Promise<Reservation[]> {
  const clean = lines.filter((line) => line.quantity > 0)
  if (clean.length === 0) return []
  const expiresAt = new Date(Date.now() + ttlSeconds * 1_000)

  const locked = await lockItems(
    tx,
    clean.map((line) => line.variantId),
  )
  const byId = new Map(locked.map((row) => [row.variantId, row]))

  for (const line of clean) {
    const row = byId.get(line.variantId)
    const available = row ? row.onHand - row.reserved : 0
    if (available < line.quantity) {
      throw new InsufficientStockError(line.variantId, line.quantity, available)
    }
  }

  const created: Reservation[] = []
  for (const line of clean) {
    await tx
      .update(inventoryItems)
      .set({
        reserved: sql`${inventoryItems.reserved} + ${line.quantity}`,
        updatedAt: new Date(),
      })
      .where(eq(inventoryItems.variantId, line.variantId))

    const [reservation] = await tx
      .insert(inventoryReservations)
      .values({
        variantId: line.variantId,
        orderId,
        quantity: line.quantity,
        expiresAt,
        status: 'held',
      })
      .returning()

    created.push({
      id: reservation!.id,
      orderId,
      variantId: line.variantId,
      quantity: line.quantity,
      expiresAt,
    })
  }
  return created
}

export function createPostgresInventoryRepository(db: Db = getDb()): InventoryRepository {  return {
    async availability(variantIds) {
      if (variantIds.length === 0) return []
      const rows = await db
        .select()
        .from(inventoryItems)
        .where(inArray(inventoryItems.variantId, [...variantIds]))
        .orderBy(inventoryItems.variantId)

      const found = new Map(rows.map((row) => [row.variantId, toSnapshot(row)]))
      // Una variante sin fila equivale a stock 0, nunca a «ilimitado».
      return variantIds.map(
        (id) => found.get(id) ?? { variantId: id, onHand: 0, reserved: 0, available: 0 },
      )
    },

    async reserveForOrder(orderId, lines: readonly StockLine[], ttlSeconds) {
      const clean = lines.filter((line) => line.quantity > 0)
      if (clean.length === 0) return []
      const expiresAt = new Date(Date.now() + ttlSeconds * 1_000)

      return db.transaction(async (tx) => {
        const locked = await lockItems(
          tx,
          clean.map((line) => line.variantId),
        )
        const byId = new Map(locked.map((row) => [row.variantId, row]))

        // 1) Validar todo antes de aplicar nada.
        for (const line of clean) {
          const row = byId.get(line.variantId)
          const available = row ? row.onHand - row.reserved : 0
          if (available < line.quantity) {
            throw new InsufficientStockError(line.variantId, line.quantity, available)
          }
        }

        // 2) Aplicar reservas y contadores.
        const created: Reservation[] = []
        for (const line of clean) {
          await tx
            .update(inventoryItems)
            .set({
              reserved: sql`${inventoryItems.reserved} + ${line.quantity}`,
              updatedAt: new Date(),
            })
            .where(eq(inventoryItems.variantId, line.variantId))

          const [reservation] = await tx
            .insert(inventoryReservations)
            .values({
              variantId: line.variantId,
              orderId,
              quantity: line.quantity,
              expiresAt,
              status: 'held',
            })
            .returning()

          created.push({
            id: reservation!.id,
            orderId,
            variantId: line.variantId,
            quantity: line.quantity,
            expiresAt,
          })
        }
        return created
      })
    },

    async commit(reservationId, actorId) {
      await db.transaction(async (tx) => {
        const [reservation] = await tx
          .select()
          .from(inventoryReservations)
          .where(eq(inventoryReservations.id, reservationId))
          .for('update')

        if (!reservation) throw new AppError('NOT_FOUND', 'Reserva inexistente')
        if (reservation.status === 'committed') return // idempotente
        if (reservation.status !== 'held') {
          throw new AppError('CONFLICT', `La reserva está ${reservation.status}`)
        }

        const [item] = await lockItems(tx, [reservation.variantId])
        const onHand = item?.onHand ?? 0
        if (onHand < reservation.quantity) {
          throw new InsufficientStockError(
            reservation.variantId,
            reservation.quantity,
            onHand,
          )
        }

        await tx
          .update(inventoryItems)
          .set({
            onHand: sql`${inventoryItems.onHand} - ${reservation.quantity}`,
            reserved: sql`${inventoryItems.reserved} - ${reservation.quantity}`,
            updatedAt: new Date(),
          })
          .where(eq(inventoryItems.variantId, reservation.variantId))

        // El ledger es obligatorio: mismo delta, misma transacción.
        await tx.insert(inventoryMovements).values({
          variantId: reservation.variantId,
          delta: -reservation.quantity,
          reason: 'order',
          orderId: reservation.orderId,
          actorId: actorId ?? null,
          note: null,
        })

        await tx
          .update(inventoryReservations)
          .set({ status: 'committed', updatedAt: new Date() })
          .where(eq(inventoryReservations.id, reservationId))
      })
    },

    async release(reservationId) {
      await db.transaction(async (tx) => {
        const [reservation] = await tx
          .select()
          .from(inventoryReservations)
          .where(eq(inventoryReservations.id, reservationId))
          .for('update')

        if (!reservation) return // liberar dos veces: no-op idempotente
        if (reservation.status !== 'held') return

        await tx
          .update(inventoryItems)
          .set({
            reserved: sql`greatest(${inventoryItems.reserved} - ${reservation.quantity}, 0)`,
            updatedAt: new Date(),
          })
          .where(eq(inventoryItems.variantId, reservation.variantId))

        await tx
          .update(inventoryReservations)
          .set({ status: 'released', updatedAt: new Date() })
          .where(eq(inventoryReservations.id, reservationId))
      })
    },

    async adjust({ variantId, delta, reason, note, actorId }: AdjustInput) {
      if (delta === 0) {
        throw new AppError('VALIDATION', 'Un movimiento de inventario no puede ser cero')
      }
      if (reason === 'adjustment' && !note) {
        throw new AppError('VALIDATION', 'Un ajuste manual exige motivo')
      }

      return db.transaction(async (tx) => {
        const [item] = await lockItems(tx, [variantId])
        const onHand = item?.onHand ?? 0
        const nextOnHand = onHand + delta
        if (nextOnHand < 0) {
          throw new AppError(
            'CONFLICT',
            `El ajuste dejaría el stock en ${nextOnHand}: no se permite stock negativo`,
          )
        }

        if (!item) {
          await tx.insert(inventoryItems).values({ variantId, onHand: nextOnHand })
        } else {
          await tx
            .update(inventoryItems)
            .set({ onHand: nextOnHand, updatedAt: new Date() })
            .where(eq(inventoryItems.variantId, variantId))
        }

        await tx.insert(inventoryMovements).values({
          variantId,
          delta,
          reason,
          actorId: actorId ?? null,
          note: note ?? null,
        })

        const [updated] = await tx
          .select()
          .from(inventoryItems)
          .where(and(eq(inventoryItems.variantId, variantId)))
          .limit(1)
        return toSnapshot(updated!)
      })
    },
  }
}
