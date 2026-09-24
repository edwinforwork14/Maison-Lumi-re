/**
 * Adaptador de inventario en memoria (desarrollo y tests unitarios).
 *
 * Cumple el contrato de `inventory.port.ts` sin base de datos. Sirve para dos
 * cosas: (1) que la app pueda funcionar sin Postgres, y (2) demostrar que el
 * puerto es realmente sustituible —los mismos tests de contrato corren contra
 * los dos adaptadores.
 *
 * No pretende ser la autoridad del stock en producción: el adaptador de
 * PostgreSQL es el que garantiza atomicidad entre procesos.
 */

import {
  InsufficientStockError,
  type AdjustInput,
  type InventoryRepository,
  type Reservation,
  type StockLine,
  type StockSnapshot,
} from './inventory.port.ts'

interface Item {
  onHand: number
  reserved: number
}

export function createInMemoryInventoryRepository(
  initial: Readonly<Record<string, { onHand: number; reserved?: number }>> = {},
): InventoryRepository {
  const items = new Map<string, Item>()
  for (const [variantId, stock] of Object.entries(initial)) {
    items.set(variantId, { onHand: stock.onHand, reserved: stock.reserved ?? 0 })
  }

  const reservations = new Map<string, Reservation>()

  function snapshot(variantId: string): StockSnapshot {
    const item = items.get(variantId)
    if (!item) {
      // Una variante sin fila de existencias se comporta como stock 0: la
      // ausencia de fila nunca debe interpretarse como «ilimitado».
      return { variantId, onHand: 0, reserved: 0, available: 0 }
    }
    return {
      variantId,
      onHand: item.onHand,
      reserved: item.reserved,
      available: item.onHand - item.reserved,
    }
  }

  return {
    async availability(variantIds) {
      return variantIds.map((id) => snapshot(id))
    },

    async reserveForOrder(orderId, lines: readonly StockLine[], ttlSeconds) {
      // Fase 1: validar todo antes de tocar nada (reserva atómica).
      for (const line of lines) {
        if (line.quantity <= 0) {
          throw new RangeError(`Cantidad no válida para ${line.variantId}: ${line.quantity}`)
        }
        const { available } = snapshot(line.variantId)
        if (available < line.quantity) {
          throw new InsufficientStockError(line.variantId, line.quantity, available)
        }
      }

      // Fase 2: aplicar.
      const created: Reservation[] = []
      const expiresAt = new Date(Date.now() + ttlSeconds * 1_000)
      for (const line of lines) {
        const item = items.get(line.variantId) ?? { onHand: 0, reserved: 0 }
        item.reserved += line.quantity
        items.set(line.variantId, item)

        const id = crypto.randomUUID()
        const reservation: Reservation = {
          id,
          orderId,
          variantId: line.variantId,
          quantity: line.quantity,
          expiresAt,
        }
        reservations.set(id, reservation)
        created.push(reservation)
      }
      return created
    },

    async commit(reservationId) {
      const reservation = reservations.get(reservationId)
      if (!reservation) throw new Error(`Reserva inexistente: ${reservationId}`)
      const item = items.get(reservation.variantId)
      if (!item) throw new Error(`Sin existencias para ${reservation.variantId}`)
      item.onHand -= reservation.quantity
      item.reserved -= reservation.quantity
      if (item.onHand < 0 || item.reserved < 0) {
        throw new RangeError('El compromiso dejaría el stock en negativo')
      }
      items.set(reservation.variantId, item)
      reservations.delete(reservationId)
    },

    async release(reservationId) {
      const reservation = reservations.get(reservationId)
      if (!reservation) return // liberar dos veces es un no-op idempotente
      const item = items.get(reservation.variantId)
      if (item) {
        item.reserved = Math.max(0, item.reserved - reservation.quantity)
        items.set(reservation.variantId, item)
      }
      reservations.delete(reservationId)
    },

    async adjust({ variantId, delta, reason, note }: AdjustInput) {
      if (delta === 0) throw new RangeError('Un movimiento de inventario no puede ser cero')
      if (reason === 'adjustment' && !note) {
        throw new RangeError('Un ajuste manual exige motivo')
      }
      const item = items.get(variantId) ?? { onHand: 0, reserved: 0 }
      const nextOnHand = item.onHand + delta
      if (nextOnHand < 0) throw new RangeError('El ajuste dejaría el stock en negativo')
      item.onHand = nextOnHand
      items.set(variantId, item)
      return snapshot(variantId)
    },
  }
}
