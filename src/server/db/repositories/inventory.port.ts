/**
 * Puerto de inventario (plan 01 §4.4: puertos y adaptadores; ADR 0005).
 *
 * El puerto describe **qué** se puede hacer con el stock, no cómo se guarda.
 * Tiene dos adaptadores intercambiables: `inventory.postgres.ts` (producción,
 * con bloqueo de filas y ledger transaccional) e `inventory.in-memory.ts`
 * (desarrollo y tests unitarios). El contenedor elige según `DATA_SOURCE`.
 *
 * Invariantes que TODO adaptador debe cumplir (plan §5.3–§5.5):
 * 1. `available = on_hand - reserved` nunca es negativo.
 * 2. Reservar es atómico: o caben todas las líneas, o no se reserva ninguna.
 * 3. Cada cambio de `on_hand` deja un movimiento en el ledger con el mismo `delta`.
 * 4. Un ajuste manual exige motivo (`note`).
 */

export type MovementReason =
  | 'purchase'
  | 'order'
  | 'return'
  | 'adjustment'
  | 'correction'
  | 'release'

export interface StockLine {
  readonly variantId: string
  readonly quantity: number
}

export interface StockSnapshot {
  readonly variantId: string
  readonly onHand: number
  readonly reserved: number
  /** Unidades realmente vendibles: `onHand - reserved`. */
  readonly available: number
}

export interface Reservation {
  readonly id: string
  readonly orderId: string
  readonly variantId: string
  readonly quantity: number
  readonly expiresAt: Date
}

export interface AdjustInput {
  readonly variantId: string
  /** Positivo entra, negativo sale. Cero no es un movimiento. */
  readonly delta: number
  readonly reason: MovementReason
  /** Obligatorio cuando `reason = 'adjustment'`. */
  readonly note?: string
  readonly actorId?: string
}

export interface InventoryRepository {
  availability(variantIds: readonly string[]): Promise<StockSnapshot[]>

  /**
   * Reserva stock para un pedido. Falla **entera** (sin dejar reservas
   * parciales) si cualquier línea no cabe: es la defensa contra la sobreventa.
   */
  reserveForOrder(
    orderId: string,
    lines: readonly StockLine[],
    ttlSeconds: number,
  ): Promise<Reservation[]>

  /** Compromete la reserva: descuenta `on_hand` y escribe el movimiento `order`. */
  commit(reservationId: string, actorId?: string): Promise<void>

  /** Libera la reserva sin tocar `on_hand` (caducada, cancelada o pago fallido). */
  release(reservationId: string): Promise<void>

  /** Ajuste manual: cambia `on_hand` y deja movimiento obligatoriamente. */
  adjust(input: AdjustInput): Promise<StockSnapshot>
}

/** Error de negocio del inventario: no hay unidades suficientes. */
export class InsufficientStockError extends Error {
  readonly variantId: string
  readonly requested: number
  readonly available: number

  constructor(variantId: string, requested: number, available: number) {
    super(`Stock insuficiente para ${variantId}: pedidas ${requested}, disponibles ${available}`)
    this.name = 'InsufficientStockError'
    this.variantId = variantId
    this.requested = requested
    this.available = available
  }
}
