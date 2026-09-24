/**
 * Dominio `identity` — usuarios, clientes, sesiones y RBAC (plan 01 §4).
 *
 * Convenciones obligatorias del plan (§3), válidas para todo `schema/*.ts`:
 * - **Ids**: `uuid('id').primaryKey().defaultRandom()`. El plan pedía uuid v7
 *   generado en servidor; PostgreSQL 16 no trae `uuidv7()` (llegó en PG18), así
 *   que aquí se usa v4 (`gen_random_uuid()`) y el v7 queda como deuda anotada.
 * - **Dinero**: `bigint('..._cents', { mode: 'number' })` + `currency char(3)`.
 *   Nunca `numeric` decimal ni `float`; todo `*_cents` lleva `CHECK >= 0`.
 * - **Tiempos**: `timestamptz` (`withTimezone: true`) en UTC.
 * - **Enums**: `text` + `CHECK (col IN (...))`, nunca `pg_enum` (evita
 *   `ALTER TYPE` bloqueante en migraciones).
 * - **Email**: índice único sobre `lower(email)`.
 * - **Borrado**: `status` o `deleted_at`; PII con `anonymized_at` (GDPR).
 */

import { sql } from 'drizzle-orm'
import {
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

// ─── Cuentas ─────────────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Se normaliza con `lower()` en el índice único: el email es case-insensitive. */
    email: text('email').notNull(),
    /** Sólo el hash (scrypt/argon2); jamás la contraseña en claro. */
    passwordHash: text('password_hash').notNull(),
    status: text('status').notNull().default('active'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    /** Marca de anonimización GDPR: el PII se sobrescribe, la fila permanece. */
    anonymizedAt: timestamp('anonymized_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('users_email_lower_key').on(sql`lower(${t.email})`),
    index('users_status_idx').on(t.status),
    check('users_email_not_blank_check', sql`length(btrim(${t.email})) > 0`),
    check('users_status_check', sql`${t.status} in ('active', 'disabled')`),
  ],
)

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    /** PII: se anonimiza junto con `anonymized_at`. */
    phone: text('phone'),
    anonymizedAt: timestamp('anonymized_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('customers_user_id_idx').on(t.userId),
    index('customers_anonymized_at_idx').on(t.anonymizedAt),
    check(
      'customers_names_not_blank_check',
      sql`length(btrim(${t.firstName})) > 0 and length(btrim(${t.lastName})) > 0`,
    ),
  ],
)

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** `admin` = panel de administración; `storefront` = tienda. */
    kind: text('kind').notNull(),
    /** Hash del token; el token en claro sólo vive en la cookie. */
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Rotación: sesión de la que procede esta (encadenado de auditoría). */
    rotatedFrom: uuid('rotated_from').references((): AnyPgColumn => sessions.id, {
      onDelete: 'set null',
    }),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_key').on(t.tokenHash),
    index('sessions_user_id_idx').on(t.userId),
    index('sessions_expires_at_idx').on(t.expiresAt),
    check('sessions_kind_check', sql`${t.kind} in ('storefront', 'admin')`),
    check('sessions_expires_after_created_check', sql`${t.expiresAt} > ${t.createdAt}`),
  ],
)

// ─── RBAC (defecto D30) ──────────────────────────────────────────────────────

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('roles_key_key').on(t.key),
    check('roles_key_not_blank_check', sql`length(btrim(${t.key})) > 0`),
  ],
)

export const permissions = pgTable(
  'permissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('permissions_key_key').on(t.key),
    check('permissions_key_not_blank_check', sql`length(btrim(${t.key})) > 0`),
  ],
)

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({
      name: 'role_permissions_pk',
      columns: [t.roleId, t.permissionId],
    }),
    index('role_permissions_permission_id_idx').on(t.permissionId),
  ],
)

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    /** Quién concedió el rol (auditoría de privilegios). */
    grantedBy: uuid('granted_by').references(() => users.id, { onDelete: 'restrict' }),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'user_roles_pk', columns: [t.userId, t.roleId] }),
    index('user_roles_role_id_idx').on(t.roleId),
  ],
)
