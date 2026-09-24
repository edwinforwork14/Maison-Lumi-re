/**
 * Dominio `shipping` — métodos, zonas, impuestos y envíos (plan 01 §4).
 * Convenciones en `identity.ts` (cabecera).
 *
 * Invariantes cubiertas aquí:
 * - `eta_max_days >= eta_min_days` y `price_cents >= 0`: una promesa de
 *   entrega imposible o un envío con precio negativo no entran.
 * - `rate_bp BETWEEN 0 AND 10000`: el IVA se guarda en puntos básicos
 *   (2100 = 21 %), nunca como fracción flotante.
 * - `UNIQUE NULLS NOT DISTINCT` en zonas y tarifas: dos zonas "sin región"
 *   para el mismo país también colisionan.
 */

import { sql } from 'drizzle-orm'
import {
  bigint,
  char,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { orders } from './orders.ts'

export const shippingMethods = pgTable(
  'shipping_methods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    carrier: text('carrier'),
    etaMinDays: integer('eta_min_days').notNull().default(0),
    etaMaxDays: integer('eta_max_days').notNull().default(0),
    priceCents: bigint('price_cents', { mode: 'number' }).notNull(),
    currency: char('currency', { length: 3 }).notNull().default('EUR'),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('shipping_methods_code_key').on(t.code),
    check('shipping_methods_code_not_blank_check', sql`length(btrim(${t.code})) > 0`),
    check('shipping_methods_price_cents_check', sql`${t.priceCents} >= 0`),
    check('shipping_methods_eta_min_days_check', sql`${t.etaMinDays} >= 0`),
    check(
      'shipping_methods_eta_range_check',
      sql`${t.etaMaxDays} >= ${t.etaMinDays}`,
    ),
    check('shipping_methods_status_check', sql`${t.status} in ('active', 'inactive')`),
  ],
)

export const shippingZones = pgTable(
  'shipping_zones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    methodId: uuid('method_id')
      .notNull()
      .references(() => shippingMethods.id, { onDelete: 'restrict' }),
    countryCode: char('country_code', { length: 2 }).notNull(),
    /** NULL = toda la región del país. */
    region: text('region'),
    priceCents: bigint('price_cents', { mode: 'number' }).notNull(),
    currency: char('currency', { length: 3 }).notNull().default('EUR'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('shipping_zones_method_country_region_key')
      .on(t.methodId, t.countryCode, t.region)
      .nullsNotDistinct(),
    index('shipping_zones_country_code_idx').on(t.countryCode),
    check('shipping_zones_price_cents_check', sql`${t.priceCents} >= 0`),
    check('shipping_zones_country_code_check', sql`${t.countryCode} ~ '^[A-Z]{2}$'`),
  ],
)

/** IVA por país/región: el tipo aplicado se snapshotea en `order_items`. */
export const taxRates = pgTable(
  'tax_rates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    countryCode: char('country_code', { length: 2 }).notNull(),
    /** NULL = tipo general del país. */
    region: text('region'),
    kind: text('kind').notNull().default('standard'),
    /** Puntos básicos: 2100 = 21 %. */
    rateBp: integer('rate_bp').notNull(),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('tax_rates_country_region_kind_from_key')
      .on(t.countryCode, t.region, t.kind, t.effectiveFrom)
      .nullsNotDistinct(),
    index('tax_rates_country_code_kind_idx').on(t.countryCode, t.kind),
    check('tax_rates_rate_bp_check', sql`${t.rateBp} between 0 and 10000`),
    check(
      'tax_rates_kind_check',
      sql`${t.kind} in ('standard', 'reduced', 'super_reduced', 'zero')`,
    ),
    check('tax_rates_country_code_check', sql`${t.countryCode} ~ '^[A-Z]{2}$'`),
    check(
      'tax_rates_effective_range_check',
      sql`${t.effectiveTo} is null or ${t.effectiveTo} > ${t.effectiveFrom}`,
    ),
  ],
)

export const shipments = pgTable(
  'shipments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    carrier: text('carrier').notNull(),
    trackingNumber: text('tracking_number').notNull(),
    status: text('status').notNull().default('pending'),
    shippedAt: timestamp('shipped_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('shipments_carrier_tracking_number_key').on(t.carrier, t.trackingNumber),
    index('shipments_order_id_idx').on(t.orderId),
    check('shipments_carrier_not_blank_check', sql`length(btrim(${t.carrier})) > 0`),
    check(
      'shipments_tracking_number_not_blank_check',
      sql`length(btrim(${t.trackingNumber})) > 0`,
    ),
    check(
      'shipments_status_check',
      sql`${t.status} in ('pending', 'label_created', 'in_transit', 'delivered', 'returned', 'failed')`,
    ),
    check(
      'shipments_delivered_after_shipped_check',
      sql`${t.deliveredAt} is null or (${t.shippedAt} is not null and ${t.deliveredAt} >= ${t.shippedAt})`,
    ),
  ],
)
