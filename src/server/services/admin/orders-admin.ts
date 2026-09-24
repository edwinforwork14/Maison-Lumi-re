/**
 * Pedidos y clientes en el panel (Plan 02, G4).
 *
 * Dos reglas que justifican este módulo:
 * 1. **Las transiciones de estado las valida el dominio**, no la UI: se reutiliza
 *    `domain/order` (`canTransition`) y cada cambio queda en `order_status_history`
 *    además de en `audit_logs`. Un estado imposible no se puede escribir.
 * 2. **La PII es un permiso aparte** (`customers:pii`): con `customers:read` se
 *    ven métricas comerciales con el contacto enmascarado, y leer los datos
 *    personales deja traza en la auditoría.
 */

import { and, asc, count, desc, eq, gte, ilike, inArray, lt, lte, sql } from 'drizzle-orm'
import { money, type Money } from '../../../domain/money/money.ts'
import { canTransition, type OrderStatus } from '../../../domain/order/order.ts'
import { getDb, type Database } from '../../db/client.ts'
import { clampPageSize, decodeCursor, paginate, type Page } from '../../db/pagination.ts'
import { customers, users } from '../../db/schema/identity.ts'
import { orderItems, orderStatusHistory, orders } from '../../db/schema/orders.ts'
import { payments } from '../../db/schema/payments.ts'
import { createPostgresAuditRepository } from '../../db/repositories/audit.postgres.ts'
import { AppError } from '../../errors.ts'
import { assertPermission, type AdminActor } from './actor.ts'
import { PERMISSIONS } from './permissions.ts'

const ORDER_STATUSES: readonly OrderStatus[] = [
  'draft',
  'placed',
  'paid',
  'fulfilled',
  'cancelled',
  'refunded',
]

/** Estados de pago sobre los que SÍ se puede reembolsar (vocabulario del esquema). */
const REFUNDABLE_PAYMENT_STATUSES: readonly string[] = [
  'authorized',
  'captured',
  'partially_refunded',
]

// ─── Pedidos ────────────────────────────────────────────────────────────────

export interface AdminOrderListItem {
  readonly id: string
  readonly number: string
  readonly email: string
  readonly status: string
  readonly totalCents: number
  readonly placedAt: Date | null
  readonly itemCount: number
}

export interface ListOrdersFilters {
  readonly status?: OrderStatus
  readonly q?: string
  readonly from?: Date
  readonly to?: Date
  readonly cursor?: string | null
  readonly size?: number
}

export async function listAdminOrders(
  actor: AdminActor | null,
  filters: ListOrdersFilters = {},
  db: Database = getDb(),
): Promise<Page<AdminOrderListItem>> {
  assertPermission(actor, PERMISSIONS.ordersRead)
  const limit = clampPageSize(filters.size)

  const conditions = []
  if (filters.status) conditions.push(eq(orders.status, filters.status))
  if (filters.q?.trim()) {
    const like = `%${filters.q.trim().toLowerCase()}%`
    conditions.push(
      sql`(lower(${orders.number}) like ${like} or lower(${orders.email}) like ${like})`,
    )
  }
  // Rango de fechas acotado: sin cota, un rango abierto barre la tabla entera.
  if (filters.from) conditions.push(gte(orders.placedAt, filters.from))
  if (filters.to) conditions.push(lte(orders.placedAt, filters.to))

  const decoded = decodeCursor(filters.cursor)
  if (decoded) {
    const cursorDate = new Date(decoded.k)
    if (!Number.isNaN(cursorDate.getTime())) {
      conditions.push(
        sql`(${orders.createdAt} < ${cursorDate} or (${orders.createdAt} = ${cursorDate} and ${orders.id} > ${decoded.id}))`,
      )
    }
  }

  const rows = await db
    .select({
      id: orders.id,
      number: orders.number,
      email: orders.email,
      status: orders.status,
      totalCents: orders.totalCents,
      placedAt: orders.placedAt,
      createdAt: orders.createdAt,
      itemCount: sql<number>`(select coalesce(sum(oi.quantity), 0)::int from order_items oi where oi.order_id = ${orders.id})`,
    })
    .from(orders)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(orders.createdAt), asc(orders.id))
    .limit(limit + 1)

  return paginate(rows, limit, (row) => row.createdAt.toISOString(), (row) => row.id)
}

export interface AdminOrderDetail {
  readonly order: {
    id: string
    number: string
    email: string
    status: string
    currency: string
    placedAt: Date | null
    createdAt: Date
    totals: {
      subtotal: Money
      discount: Money
      shipping: Money
      tax: Money
      total: Money
    }
  }
  readonly lines: ReadonlyArray<{
    id: string
    sku: string
    name: string
    quantity: number
    unitPrice: Money
    lineTotal: Money
  }>
  readonly payments: ReadonlyArray<{
    id: string
    provider: string
    status: string
    amount: Money
    refunded: Money
  }>
  readonly history: ReadonlyArray<{
    from: string | null
    to: string
    note: string | null
    at: Date
  }>
  readonly nextStatuses: readonly OrderStatus[]
}

export async function getAdminOrder(
  actor: AdminActor | null,
  orderId: string,
  db: Database = getDb(),
): Promise<AdminOrderDetail> {
  assertPermission(actor, PERMISSIONS.ordersRead)

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)
  if (!order) throw new AppError('NOT_FOUND', 'Pedido inexistente')

  const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId))
  const orderPayments = await db.select().from(payments).where(eq(payments.orderId, orderId))
  const history = await db
    .select()
    .from(orderStatusHistory)
    .where(eq(orderStatusHistory.orderId, orderId))
    .orderBy(asc(orderStatusHistory.createdAt))

  const current = order.status as OrderStatus
  const nextStatuses = ORDER_STATUSES.filter((candidate) => canTransition(current, candidate))

  return {
    order: {
      id: order.id,
      number: order.number,
      email: order.email,
      status: order.status,
      currency: order.currency,
      placedAt: order.placedAt,
      createdAt: order.createdAt,
      totals: {
        subtotal: money(order.subtotalCents),
        discount: money(order.discountCents),
        shipping: money(order.shippingCents),
        tax: money(order.taxCents),
        total: money(order.totalCents),
      },
    },
    lines: lines.map((line) => ({
      id: line.id,
      sku: line.skuSnapshot,
      name: line.nameSnapshot,
      quantity: line.quantity,
      unitPrice: money(line.unitPriceCents),
      lineTotal: money(line.lineTotalCents),
    })),
    payments: orderPayments.map((payment) => ({
      id: payment.id,
      provider: payment.provider,
      status: payment.status,
      amount: money(payment.amountCents),
      refunded: money(payment.refundedCents),
    })),
    history: history.map((entry) => ({
      from: entry.fromStatus,
      to: entry.toStatus,
      note: entry.note,
      at: entry.createdAt,
    })),
    nextStatuses,
  }
}

/** Cambia el estado validando la transición con el dominio y dejando historial. */
export async function updateAdminOrderStatus(
  actor: AdminActor | null,
  input: { id: string; to: OrderStatus; note?: string },
  db: Database = getDb(),
): Promise<{ from: string; to: string }> {
  assertPermission(actor, PERMISSIONS.ordersUpdate)
  const audit = createPostgresAuditRepository(db)

  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, input.id)).for('update')
    if (!order) throw new AppError('NOT_FOUND', 'Pedido inexistente')

    const from = order.status as OrderStatus
    if (from === input.to) {
      throw new AppError('CONFLICT', `El pedido ya está en estado ${input.to}`)
    }
    if (!canTransition(from, input.to)) {
      throw new AppError(
        'CONFLICT',
        `Transición no permitida: ${from} → ${input.to}`,
      )
    }

    await tx
      .update(orders)
      .set({ status: input.to, updatedAt: new Date() })
      .where(eq(orders.id, input.id))

    await tx.insert(orderStatusHistory).values({
      orderId: input.id,
      fromStatus: from,
      toStatus: input.to,
      actorId: actor!.userId,
      note: input.note ?? null,
    })

    await audit.record({
      actorId: actor!.userId,
      actorKind: 'user',
      action: 'order.update_status',
      entity: 'orders',
      entityId: input.id,
      before: { status: from },
      after: { status: input.to, note: input.note ?? null },
    })

    return { from, to: input.to }
  })
}

/**
 * Reembolso. Nunca puede superar lo cobrado: el límite se comprueba contra
 * `payments` en la misma transacción (y la base lo vuelve a impedir con su CHECK).
 */
export async function refundAdminOrder(
  actor: AdminActor | null,
  input: { id: string; amountCents: number; reason: string },
  db: Database = getDb(),
): Promise<{ refundedCents: number; status: string }> {
  assertPermission(actor, PERMISSIONS.ordersRefund)
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new AppError('VALIDATION', 'El importe del reembolso debe ser un entero positivo')
  }
  if (input.reason.trim().length < 3) {
    throw new AppError('VALIDATION', 'El reembolso exige un motivo')
  }
  const audit = createPostgresAuditRepository(db)

  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, input.id)).for('update')
    if (!order) throw new AppError('NOT_FOUND', 'Pedido inexistente')

    const orderPayments = await tx
      .select()
      .from(payments)
      .where(eq(payments.orderId, input.id))
      .for('update')

    const paid = orderPayments
      .filter((payment) => REFUNDABLE_PAYMENT_STATUSES.includes(payment.status))
      .reduce((total, payment) => total + payment.amountCents, 0)
    const alreadyRefunded = orderPayments.reduce(
      (total, payment) => total + payment.refundedCents,
      0,
    )
    if (paid === 0) {
      throw new AppError('CONFLICT', 'El pedido no tiene pagos cobrados que reembolsar')
    }
    if (alreadyRefunded + input.amountCents > paid) {
      throw new AppError(
        'CONFLICT',
        `El reembolso (${input.amountCents}) supera lo cobrado pendiente (${paid - alreadyRefunded})`,
      )
    }

    // Se reparte el reembolso entre los pagos, empezando por el primero.
    let remaining = input.amountCents
    for (const payment of orderPayments) {
      if (remaining === 0) break
      if (!REFUNDABLE_PAYMENT_STATUSES.includes(payment.status)) continue
      const capacity = payment.amountCents - payment.refundedCents
      if (capacity <= 0) continue
      const portion = Math.min(capacity, remaining)
      remaining -= portion
      const refundedAfter = payment.refundedCents + portion
      await tx
        .update(payments)
        .set({
          refundedCents: refundedAfter,
          status: refundedAfter >= payment.amountCents ? 'refunded' : 'partially_refunded',
          updatedAt: new Date(),
        })
        .where(eq(payments.id, payment.id))
    }

    const totalRefunded = alreadyRefunded + input.amountCents
    const fullyRefunded = totalRefunded >= paid

    // El estado del pedido sigue las reglas del dominio; si la transición no es
    // válida (p. ej. un pedido `placed` sin cobrar), sólo se registra el reembolso.
    let status = order.status
    const target: OrderStatus = fullyRefunded ? 'refunded' : order.status as OrderStatus
    if (canTransition(order.status as OrderStatus, target) && target !== order.status) {
      status = target
      await tx
        .update(orders)
        .set({ status: target, updatedAt: new Date() })
        .where(eq(orders.id, input.id))
      await tx.insert(orderStatusHistory).values({
        orderId: input.id,
        fromStatus: order.status,
        toStatus: target,
        actorId: actor!.userId,
        note: `Reembolso: ${input.reason}`,
      })
    }

    await audit.record({
      actorId: actor!.userId,
      actorKind: 'user',
      action: 'order.refund',
      entity: 'orders',
      entityId: input.id,
      before: { refundedCents: alreadyRefunded },
      after: { refundedCents: totalRefunded, reason: input.reason, status },
    })

    return { refundedCents: totalRefunded, status }
  })
}

// ─── Clientes ───────────────────────────────────────────────────────────────

export interface AdminCustomerListItem {
  readonly id: string
  readonly name: string
  /** Enmascarado salvo que el actor tenga `customers:pii`. */
  readonly email: string
  readonly orderCount: number
  readonly totalSpentCents: number
  readonly lastOrderAt: Date | null
  readonly piiVisible: boolean
}

export interface ListCustomersFilters {
  readonly q?: string
  readonly cursor?: string | null
  readonly size?: number
}

/** `a***@dominio` — suficiente para operar sin exponer el dato personal. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!local || !domain) return '***'
  return `${local.slice(0, 1)}***@${domain}`
}

export async function listAdminCustomers(
  actor: AdminActor | null,
  filters: ListCustomersFilters = {},
  db: Database = getDb(),
): Promise<Page<AdminCustomerListItem>> {
  assertPermission(actor, PERMISSIONS.customersRead)
  const canSeePii = actor!.permissions.includes(PERMISSIONS.customersPii)
  const limit = clampPageSize(filters.size)

  const conditions = []
  if (filters.q?.trim()) {
    const like = `%${filters.q.trim().toLowerCase()}%`
    conditions.push(
      sql`(lower(${users.email}) like ${like} or lower(${customers.lastName}) like ${like} or lower(${customers.firstName}) like ${like})`,
    )
  }
  const decoded = decodeCursor(filters.cursor)
  if (decoded) {
    const cursorDate = new Date(decoded.k)
    if (!Number.isNaN(cursorDate.getTime())) {
      conditions.push(
        sql`(${customers.createdAt} < ${cursorDate} or (${customers.createdAt} = ${cursorDate} and ${customers.id} > ${decoded.id}))`,
      )
    }
  }

  const rows = await db
    .select({
      id: customers.id,
      firstName: customers.firstName,
      lastName: customers.lastName,
      email: users.email,
      createdAt: customers.createdAt,
      orderCount: sql<number>`(select count(*)::int from orders o where lower(o.email) = lower(${users.email}))`,
      totalSpentCents: sql<number>`(select coalesce(sum(o.total_cents), 0)::int from orders o where lower(o.email) = lower(${users.email}) and o.status in ('placed','paid','fulfilled'))`,
      lastOrderAt: sql<Date | null>`(select max(o.placed_at) from orders o where lower(o.email) = lower(${users.email}))`,
    })
    .from(customers)
    .innerJoin(users, eq(users.id, customers.userId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(customers.createdAt), asc(customers.id))
    .limit(limit + 1)

  return paginate(
    rows.map((row) => ({
      id: row.id,
      name: `${row.firstName} ${row.lastName}`.trim(),
      email: canSeePii ? row.email : maskEmail(row.email),
      orderCount: Number(row.orderCount),
      totalSpentCents: Number(row.totalSpentCents),
      lastOrderAt: row.lastOrderAt ? new Date(row.lastOrderAt) : null,
      piiVisible: canSeePii,
    })),
    limit,
    (row) => row.id,
    (row) => row.id,
  )
}

export interface AdminCustomerDetail {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly phone: string | null
  readonly metrics: { orderCount: number; totalSpent: Money; lastOrderAt: Date | null }
  readonly orders: ReadonlyArray<{ number: string; status: string; total: Money; placedAt: Date | null }>
}

/**
 * Ficha de cliente. Ver el contacto exige `customers:pii` **y** deja traza: una
 * consulta de datos personales es una acción auditable, no una lectura anónima.
 */
export async function getAdminCustomer(
  actor: AdminActor | null,
  customerId: string,
  db: Database = getDb(),
): Promise<AdminCustomerDetail> {
  assertPermission(actor, PERMISSIONS.customersRead)
  const canSeePii = actor!.permissions.includes(PERMISSIONS.customersPii)

  const [row] = await db
    .select({
      id: customers.id,
      firstName: customers.firstName,
      lastName: customers.lastName,
      phone: customers.phone,
      email: users.email,
    })
    .from(customers)
    .innerJoin(users, eq(users.id, customers.userId))
    .where(eq(customers.id, customerId))
    .limit(1)
  if (!row) throw new AppError('NOT_FOUND', 'Cliente inexistente')

  const customerOrders = await db
    .select({
      number: orders.number,
      status: orders.status,
      totalCents: orders.totalCents,
      placedAt: orders.placedAt,
    })
    .from(orders)
    .where(sql`lower(${orders.email}) = lower(${row.email})`)
    .orderBy(desc(orders.placedAt))
    .limit(20)

  const totalSpent = customerOrders
    .filter((order) => ['placed', 'paid', 'fulfilled'].includes(order.status))
    .reduce((total, order) => total + order.totalCents, 0)

  if (canSeePii) {
    const audit = createPostgresAuditRepository(db)
    await audit.record({
      actorId: actor!.userId,
      actorKind: 'user',
      action: 'customer.read_pii',
      entity: 'customers',
      entityId: customerId,
      before: null,
      after: { fields: ['email', 'phone'] },
    })
  }

  return {
    id: row.id,
    name: `${row.firstName} ${row.lastName}`.trim(),
    email: canSeePii ? row.email : maskEmail(row.email),
    phone: canSeePii ? row.phone : null,
    metrics: {
      orderCount: customerOrders.length,
      totalSpent: money(totalSpent),
      lastOrderAt: customerOrders[0]?.placedAt ?? null,
    },
    orders: customerOrders.map((order) => ({
      number: order.number,
      status: order.status,
      total: money(order.totalCents),
      placedAt: order.placedAt,
    })),
  }
}
