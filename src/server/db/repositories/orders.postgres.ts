/**
 * Checkout transaccional sobre PostgreSQL (plan 01 §6): o queda el pedido con
 * su stock reservado y su clave de idempotencia, o no queda nada.
 *
 * Garantías:
 * 1. **Sin sobreventa**: la reserva bloquea las filas con `FOR UPDATE` en orden
 *    estable; dos checkouts simultáneos sobre la última unidad ⇒ uno gana.
 * 2. **Idempotencia con huella**: `idempotency_keys` guarda el hash del payload.
 *    Misma clave + mismo contenido ⇒ se devuelve el pedido original (replay);
 *    misma clave + contenido distinto ⇒ `CONFLICT` (nunca un pedido «mezclado»).
 * 3. **Número por secuencia**, no aleatorio (`orders_number_seq`).
 * 4. El pedido nace `placed` con `placed_at`; el compromiso de stock llega al
 *    confirmar el pago (`commit` del puerto de inventario).
 */

import { createHash } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { AppError } from '../../errors.ts'
import { getDb, type Database } from '../client.ts'
import { idempotencyKeys } from '../schema/ops.ts'
import { orderItems, orders } from '../schema/orders.ts'
import { reserveWithinTx } from './inventory.postgres.ts'
import { InsufficientStockError } from './inventory.port.ts'

type Db = Database

export const CHECKOUT_SCOPE = 'checkout.place'
const IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24
const DEFAULT_RESERVATION_TTL_SECONDS = 60 * 15

export interface CheckoutLine {
  readonly variantId: string
  readonly sku: string
  readonly name: string
  readonly unitPriceCents: number
  readonly quantity: number
}

export interface CheckoutTotals {
  readonly subtotalCents: number
  readonly discountCents?: number
  readonly shippingCents?: number
  readonly taxCents?: number
  readonly totalCents: number
}

export interface PlaceOrderInput {
  readonly email: string
  readonly userId?: string
  readonly currency?: string
  readonly lines: readonly CheckoutLine[]
  readonly totals: CheckoutTotals
  readonly shippingMethodId?: string
  readonly idempotencyKey: string
  readonly reservationTtlSeconds?: number
}

export interface PlacedOrder {
  readonly orderId: string
  readonly number: string
  readonly status: string
  readonly totalCents: number
  /** `true` si la respuesta venía de una clave de idempotencia ya usada. */
  readonly replayed: boolean
  readonly reservationIds: readonly string[]
}

/** Huella canónica del payload: el orden de las líneas no la altera. */
export function fingerprintCheckout(input: PlaceOrderInput): string {
  const canonical = JSON.stringify({
    email: input.email.trim().toLowerCase(),
    currency: input.currency ?? 'EUR',
    lines: [...input.lines]
      .map((l) => [l.variantId, l.quantity, l.unitPriceCents])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    totals: input.totals,
  })
  return createHash('sha256').update(canonical).digest('hex')
}

export async function placeOrderTransactional(
  input: PlaceOrderInput,
  db: Db = getDb(),
): Promise<PlacedOrder> {
  if (input.lines.length === 0) {
    throw new AppError('VALIDATION', 'El pedido no tiene líneas')
  }

  const requestHash = fingerprintCheckout(input)

  try {
    return await db.transaction(async (tx) => {
      // 1) Idempotencia: se bloquea la clave para serializar reintentos.
      const [existing] = await tx
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.key, input.idempotencyKey))
        .for('update')

      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new AppError(
            'CONFLICT',
            'La clave de idempotencia ya se usó con un contenido distinto',
          )
        }
        const stored = existing.response as unknown as PlacedOrder | null
        if (!stored) {
          throw new AppError('CONFLICT', 'La clave de idempotencia está en curso')
        }
        return { ...stored, replayed: true }
      }

      // 2) Número de pedido por secuencia (nunca aleatorio, plan §5.7).
      const seqRows = (await tx.execute(
        sql`select nextval('orders_number_seq') as nextval`,
      )) as unknown as Array<{ nextval: string | number }>
      const sequence = Number(seqRows[0]?.nextval ?? 0)
      const number = `ML-${String(sequence).padStart(6, '0')}`

      // 3) Pedido + líneas (con snapshot: el pasado no se reescribe).
      const [order] = await tx
        .insert(orders)
        .values({
          number,
          email: input.email.trim().toLowerCase(),
          userId: input.userId ?? null,
          status: 'placed',
          currency: input.currency ?? 'EUR',
          subtotalCents: input.totals.subtotalCents,
          discountCents: input.totals.discountCents ?? 0,
          shippingCents: input.totals.shippingCents ?? 0,
          taxCents: input.totals.taxCents ?? 0,
          totalCents: input.totals.totalCents,
          shippingMethodId: input.shippingMethodId ?? null,
          idempotencyKey: input.idempotencyKey,
          placedAt: new Date(),
        })
        .returning()

      await tx.insert(orderItems).values(
        input.lines.map((line) => ({
          orderId: order!.id,
          variantId: line.variantId,
          skuSnapshot: line.sku,
          nameSnapshot: line.name,
          unitPriceCents: line.unitPriceCents,
          quantity: line.quantity,
          lineTotalCents: line.unitPriceCents * line.quantity,
        })),
      )

      // 4) Reserva de stock en la MISMA transacción.
      const reservations = await reserveWithinTx(
        tx,
        order!.id,
        input.lines.map((line) => ({
          variantId: line.variantId,
          quantity: line.quantity,
        })),
        input.reservationTtlSeconds ?? DEFAULT_RESERVATION_TTL_SECONDS,
      )

      const placed: PlacedOrder = {
        orderId: order!.id,
        number: order!.number,
        status: order!.status,
        totalCents: order!.totalCents,
        replayed: false,
        reservationIds: reservations.map((r) => r.id),
      }

      // 5) Se guarda la respuesta para reintentos idénticos.
      await tx.insert(idempotencyKeys).values({
        key: input.idempotencyKey,
        scope: CHECKOUT_SCOPE,
        requestHash,
        response: placed as unknown as Record<string, unknown>,
        orderId: order!.id,
        expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_SECONDS * 1_000),
      })

      return placed
    })
  } catch (error) {
    // El error de negocio viaja tipado: la UI muestra un mensaje, no un stack.
    if (error instanceof InsufficientStockError) {
      throw new AppError('OUT_OF_STOCK', error.message, error)
    }
    throw error
  }
}
