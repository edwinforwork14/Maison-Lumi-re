/**
 * Dominio `content` — ajustes del sitio, secciones de portada y banners
 * (plan 01 §4). Convenciones en `identity.ts` (cabecera).
 *
 * Invariantes cubiertas aquí:
 * - `site_settings.value` es `jsonb` con `type` declarado: el valor se valida
 *   con Zod **al leer**, no al escribir (§4).
 * - `UNIQUE(key)` en secciones y banners: una clave, una pieza de contenido.
 * - Índice parcial `(placement, position) WHERE status = 'published'`: el
 *   storefront sólo ordena lo publicado. El filtro de vigencia temporal no
 *   puede ir en el predicado del índice (`now()` no es IMMUTABLE) y se aplica
 *   en la consulta.
 */

import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { productMedia } from './catalog.ts'
import { users } from './identity.ts'

export const siteSettings = pgTable(
  'site_settings',
  {
    /** Clave legible: `shipping.free_threshold_cents`, `site.currency`, … */
    key: text('key').primaryKey(),
    value: jsonb('value').$type<unknown>().notNull(),
    type: text('type').notNull().default('json'),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('site_settings_key_not_blank_check', sql`length(btrim(${t.key})) > 0`),
    check(
      'site_settings_type_check',
      sql`${t.type} in ('string', 'number', 'boolean', 'json')`,
    ),
  ],
)

export const homepageSections = pgTable(
  'homepage_sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    title: text('title'),
    subtitle: text('subtitle'),
    ctaLabel: text('cta_label'),
    ctaHref: text('cta_href'),
    mediaId: uuid('media_id').references(() => productMedia.id, { onDelete: 'restrict' }),
    /** Ranura de la portada (`home`, `home_featured`, …): vocabulario libre,
     *  validado en la frontera con Zod, no un enum congelado en la BD. */
    placement: text('placement').notNull().default('home'),
    position: integer('position').notNull().default(0),
    status: text('status').notNull().default('draft'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('homepage_sections_key_key').on(t.key),
    index('homepage_sections_placement_position_idx')
      .on(t.placement, t.position)
      .where(sql`${t.status} = 'published'`),
    check('homepage_sections_key_not_blank_check', sql`length(btrim(${t.key})) > 0`),
    check('homepage_sections_position_check', sql`${t.position} >= 0`),
    check(
      'homepage_sections_status_check',
      sql`${t.status} in ('draft', 'published', 'archived')`,
    ),
    check(
      'homepage_sections_window_check',
      sql`${t.endsAt} is null or ${t.startsAt} is null or ${t.endsAt} > ${t.startsAt}`,
    ),
  ],
)

export const banners = pgTable(
  'banners',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    title: text('title'),
    subtitle: text('subtitle'),
    ctaLabel: text('cta_label'),
    ctaHref: text('cta_href'),
    mediaId: uuid('media_id').references(() => productMedia.id, { onDelete: 'restrict' }),
    /** Ranura donde se pinta (`home_hero`, `home_strip`, `checkout`, …). */
    placement: text('placement').notNull().default('home_hero'),
    position: integer('position').notNull().default(0),
    status: text('status').notNull().default('draft'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('banners_key_key').on(t.key),
    index('banners_placement_position_idx')
      .on(t.placement, t.position)
      .where(sql`${t.status} = 'published'`),
    check('banners_key_not_blank_check', sql`length(btrim(${t.key})) > 0`),
    check('banners_position_check', sql`${t.position} >= 0`),
    check('banners_status_check', sql`${t.status} in ('draft', 'published', 'archived')`),
    check(
      'banners_window_check',
      sql`${t.endsAt} is null or ${t.startsAt} is null or ${t.endsAt} > ${t.startsAt}`,
    ),
  ],
)
