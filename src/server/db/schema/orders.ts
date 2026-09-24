/**
 * Dominio `orders` — carrito, direcciones, pedido, líneas y trazabilidad
 * (plan 01 §4). Convenciones en `identity.ts` (cabecera).
 *
 * Invariantes cubiertas aquí:
 * - `total_cents = subtotal - discount + shipping + tax` (§5.5): un total
 *   descuadrado no se puede insertar, ni por error ni a mano.
 * - `order_items` guarda **snapshot** de SKU, nombre, precio y tipo de IVA
 *   (§5.6): cambiar el precio del producto no reescribe pedidos pasados.
 * - `orders.number` sale de `orders_number_seq`, nunca de `Math.random()`
 *   (§5.7 / D28); la forma no enumerable la compone el repositorio.
 * - Cada cambio de estado escribe `order_status_history` (append-only, §5.8).
 */

import { sql } from 'drizzle-orm'
import {
  bigint,
  char,
  check,
  index,
  integer,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { productVariants } from './catalog.ts'
import { customers, users } from './identity.ts'
import { coupons } from './promotions.ts'
import { shippingMethods } from './shipping.ts'

/**
 * Secuencia del número de pedido (§5.7). No es un `serial`: se consume con
 * `nextval('orders_number_seq')` dentro de la transacción de checkout.
 */
export const ordersNumberSeq = pgSequence('orders_number_seq', { startWith: 1000 })

/** Estados válidos: los mismos de `src/domain/order/order.ts:9-15`. */
const ORDER_STATUSES = sql.raw(`('draft', 'placed', 'paid', 'fulfilled', 'cancelled', 'refunded')`)

// ─── Carrito (pre-pedido) ────────────────────────────────────────────────────

export const carts = pgTable(
  'carts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Carrito de cliente identificado… */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }),
    /** …o de visitante: al menos uno de los dos dueños es obligatorio. */
    anonymousToken: text('anonymous_token'),
    currency: char('currency', { length: 3 }).notNull().default('EUR'),
    status: text('status').notNull().default('active'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('carts_user_id_idx').on(t.userId),
    index('carts_status_idx').on(t.status),
    uniqueIndex('carts_anonymous_token_key')
      .on(t.anonymousToken)
      .where(sql`${t.anonymousToken} is not null`),
    check(
      'carts_owner_check',
      sql`${t.userId} is not null or ${t.anonymousToken} is not null`,
    ),
    check('carts_status_check', sql`${t.status} in ('active', 'converted', 'abandoned', 'expired')`),
  ],
)

export const cartItems = pgTable(
  'cart_items',
  {
    cartId: uuid('cart_id')
      .notNull()
      .references(() => carts.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),
    quantity: bigint('quantity', { mode: 'number' }).notNull(),
    /** Precio cotizado por el servidor; el cliente nunca lo propone. */
    unitPriceCents: bigint('unit_price_cents', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'cart_items_pk', columns: [t.cartId, t.variantId] }),
    index('cart_items_variant_id_idx').on(t.variantId),
    check('cart_items_quantity_check', sql`${t.quantity} > 0`),
    check('cart_items_unit_price_cents_check', sql`${t.unitPriceCents} >= 0`),
  ],
)

// ─── Direcciones (PII) ───────────────────────────────────────────────────────

export const addresses = pgTable(
  'addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    kind: text('kind').notNull(),
    line1: text('line1').notNull(),
    line2: text('line2'),
    city: text('city').notNull(),
    postalCode: text('postal_code').notNull(),
    countryCode: char('country_code', { length: 2 }).notNull(),
    region: text('region'),
    /** PII: se anonimiza con el cliente. */
    phone: text('phone'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('addresses_customer_id_idx').on(t.customerId),
    index('addresses_customer_kind_idx').on(t.customerId, t.kind),
    check('addresses_kind_check', sql`${t.kind} in ('shipping', 'billing')`),
    check('addresses_country_code_check', sql`${t.countryCode} ~ '^[A-Z]{2}$'`),
  ],
)

// ─── Pedido ──────────────────────────────────────────────────────────────────

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** `ML-…` compuesto por el repositorio a partir de `orders_number_seq`. */
    number: text('number').notNull(),
    /** Puede ser NULL: hay checkout de invitado. */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }),
    /** Email de contacto del pedido (puede no coincidir con la cuenta). */
    email: text('email').notNull(),
    status: text('status').notNull().default('draft'),
    currency: char('currency', { length: 3 }).notNull().default('EUR'),
    subtotalCents: bigint('subtotal_cents', { mode: 'number' }).notNull(),
    discountCents: bigint('discount_cents', { mode: 'number' }).notNull().default(0),
    shippingCents: bigint('shipping_cents', { mode: 'number' }).notNull().default(0),
    taxCents: bigint('tax_cents', { mode: 'number' }).notNull().default(0),
    totalCents: bigint('total_cents', { mode: 'number' }).notNull(),
    shippingMethodId: uuid('shipping_method_id').references(() => shippingMethods.id, {
      onDelete: 'restrict',
    }),
    couponId: uuid('coupon_id').references(() => coupons.id, { onDelete: 'restrict' }),
    /** Misma clave + mismo payload ⇒ misma respuesta (D27); `NULL` = sin clave. */
    idempotencyKey: text('idempotency_key'),
    placedAt: timestamp('placed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('orders_number_key').on(t.number),
    uniqueIndex('orders_idempotency_key_key').on(t.idempotencyKey),
    index('orders_user_placed_idx').on(t.userId, t.placedAt.desc()),
    index('orders_status_idx').on(t.status),
    index('orders_placed_at_idx').on(t.placedAt),
    check('orders_number_not_blank_check', sql`length(btrim(${t.number})) > 0`),
    check('orders_status_check', sql`${t.status} in ${ORDER_STATUSES}`),
    check('orders_subtotal_cents_check', sql`${t.subtotalCents} >= 0`),
    check('orders_discount_cents_check', sql`${t.discountCents} >= 0`),
    check('orders_shipping_cents_check', sql`${t.shippingCents} >= 0`),
    check('orders_tax_cents_check', sql`${t.taxCents} >= 0`),
    check('orders_total_cents_check', sql`${t.totalCents} >= 0`),
    // §5.5: la identidad aritmética del total, garantizada por la base de datos.
    check(
      'orders_total_identity_check',
      sql`${t.totalCents} = ${t.subtotalCents} - ${t.discountCents} + ${t.shippingCents} + ${t.taxCents}`,
    ),
    check(
      'orders_placed_at_check',
      sql`${t.status} = 'draft' or ${t.placedAt} is not null`,
    ),
  ],
)

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Hijo propio del pedido: se borra con él (CASCADE, §5.1).
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),
    /** Snapshot: lo que se vendió, no lo que hoy dice el catálogo (§5.6). */
    skuSnapshot: text('sku_snapshot').notNull(),
    nameSnapshot: text('name_snapshot').notNull(),
    unitPriceCents: bigint('unit_price_cents', { mode: 'number' }).notNull(),
    quantity: bigint('quantity', { mode: 'number' }).notNull(),
    lineTotalCents: bigint('line_total_cents', { mode: 'number' }).notNull(),
    /** Tipo de IVA aplicado en puntos básicos (2100 = 21 %). */
    taxRateBp: integer('tax_rate_bp').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('order_items_order_id_idx').on(t.orderId),
    index('order_items_variant_id_idx').on(t.variantId),
    check('order_items_quantity_check', sql`${t.quantity} > 0`),
    check('order_items_unit_price_cents_check', sql`${t.unitPriceCents} >= 0`),
    check('order_items_line_total_cents_check', sql`${t.lineTotalCents} >= 0`),
    check(
      'order_items_line_total_identity_check',
      sql`${t.lineTotalCents} = ${t.unitPriceCents} * ${t.quantity}`,
    ),
    check('order_items_tax_rate_bp_check', sql`${t.taxRateBp} between 0 and 10000`),
  ],
)

/** Snapshot inmutable de la dirección usada en el pedido (PII). */
export const orderAddresses = pgTable(
  'order_addresses',
  {
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    recipientName: text('recipient_name'),
    line1: text('line1').notNull(),
    line2: text('line2'),
    city: text('city').notNull(),
    postalCode: text('postal_code').notNull(),
    countryCode: char('country_code', { length: 2 }).notNull(),
    region: text('region'),
    phone: text('phone'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'order_addresses_pk', columns: [t.orderId, t.kind] }),
    check('order_addresses_kind_check', sql`${t.kind} in ('shipping', 'billing')`),
    check('order_addresses_country_code_check', sql`${t.countryCode} ~ '^[A-Z]{2}$'`),
  ],
)

/** Append-only: el rol de la app no tiene UPDATE/DELETE sobre esta tabla (§5.8). */
export const orderStatusHistory = pgTable(
  'order_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    /** NULL en la creación del pedido (no hay estado anterior). */
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'restrict' }),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('order_status_history_order_created_idx').on(t.orderId, t.createdAt),
    check('order_status_history_to_status_check', sql`${t.toStatus} in ${ORDER_STATUSES}`),
    check(
      'order_status_history_from_status_check',
      sql`${t.fromStatus} is null or ${t.fromStatus} in ${ORDER_STATUSES}`,
    ),
    check(
      'order_status_history_transition_check',
      sql`${t.fromStatus} is null or ${t.fromStatus} <> ${t.toStatus}`,
    ),
  ],
)
