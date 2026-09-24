/**
 * Superficie cliente↔servidor del panel administrativo (Plan 02 §4).
 *
 * Mismo patrón que `features/commerce.api.ts`: server functions con Zod en toda
 * entrada, sesión resuelta en servidor y nada de acceso directo a la base desde
 * el navegador. Cada handler delega en `server/services/admin/*`, que es quien
 * exige el permiso.
 */

import { createServerFn } from '@tanstack/react-start'
import { getCookie, setCookie } from '@tanstack/react-start/server'
import { z } from 'zod'
import { AppError } from '@/server/errors'
import {
  ADMIN_SESSION_COOKIE,
  resolveAdminActor,
  type AdminActor,
} from '@/server/services/admin/actor'
import {
  adjustAdminInventory,
  createAdminProduct,
  dashboardKpis,
  deleteAdminVariant,
  getAdminProduct,
  listAdminCategories,
  listAdminInventory,
  listAdminProducts,
  listAuditEntries,
  setAdminProductStatus,
  updateAdminProduct,
  upsertAdminCategory,
  upsertAdminVariant,
  type AdminCategoryRow,
  type AdminInventoryRow,
  type AdminProductDetail,
  type AdminProductListItem,
  type AuditListItem,
  type DashboardKpis,
} from '@/server/services/admin/catalog-admin'
import {
  assignAdminRole,
  listAdminContent,
  listAdminRoles,
  listAdminSettings,
  listAdminUsers,
  revokeAdminRole,
  updateAdminSetting,
  upsertAdminContent,
  type AdminContentRow,
  type AdminSettingRow,
  type AdminUserRow,
} from '@/server/services/admin/content-admin'
import { findActiveUserByEmail } from '@/server/db/repositories/sessions.postgres'
import { verifyPassword } from '@/server/runtime/password-hasher'
import {
  getAdminCustomer,
  getAdminOrder,
  listAdminCustomers,
  listAdminOrders,
  refundAdminOrder,
  updateAdminOrderStatus,
  type AdminCustomerDetail,
  type AdminCustomerListItem,
  type AdminOrderDetail,
  type AdminOrderListItem,
} from '@/server/services/admin/orders-admin'
import {
  createPostgresSessionsRepository,
  resolveSessionSecret,
} from '@/server/db/repositories/sessions.postgres'
import { ADMIN_SESSION_TTL_SECONDS } from '@/server/services/admin/actor'

// ─── Sesión del panel ───────────────────────────────────────────────────────

export interface AdminSessionState {
  readonly actor: AdminActor | null
  /** `false` cuando el panel no puede operar (sin base de datos configurada). */
  readonly available: boolean
}

/**
 * Estado de la sesión administrativa. No lanza por falta de configuración:
 * devuelve `available: false` para que la UI explique el problema en lugar de
 * mostrar un error críptico.
 */
export const adminSession = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AdminSessionState> => {
    try {
      const actor = await resolveAdminActor(getCookie(ADMIN_SESSION_COOKIE))
      return { actor, available: true }
    } catch {
      return { actor: null, available: false }
    }
  },
)

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
})

/**
 * Login del panel. La sesión es de tipo `admin` (cookie propia, TTL corto) y
 * **separada** de la de tienda: entrar en la tienda no abre el panel.
 *
 * Nota de seguridad pendiente (§3): falta el limitador de intentos por IP; el
 * error es genérico a propósito para no revelar si el email existe.
 */
export const adminLogin = createServerFn({ method: 'POST' })
  .validator(credentialsSchema)
  .handler(async ({ data }): Promise<{ userId: string }> => {
    const user = await findActiveUserByEmail(data.email)
    if (!user || !verifyPassword(data.password, user.passwordHash)) {
      throw new AppError('UNAUTHENTICATED', 'Credenciales incorrectas')
    }

    const sessions = createPostgresSessionsRepository(undefined, resolveSessionSecret())
    const issued = await sessions.issue({ userId: user.id, kind: 'admin' })

    setCookie(ADMIN_SESSION_COOKIE, issued.cookieValue, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: ADMIN_SESSION_TTL_SECONDS,
    })
    return { userId: user.id }
  })

export const adminLogout = createServerFn({ method: 'POST' }).handler(async () => {
  const cookie = getCookie(ADMIN_SESSION_COOKIE)
  if (cookie) {
    try {
      const sessions = createPostgresSessionsRepository(undefined, resolveSessionSecret())
      await sessions.revoke(cookie)
    } catch {
      // Aunque falle la revocación en servidor, la cookie se borra igualmente.
    }
  }
  setCookie(ADMIN_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  })
  return { ok: true }
})

// ─── Panel ──────────────────────────────────────────────────────────────────

const rangeSchema = z.object({
  /** Días hacia atrás (por defecto 30). Acotado para no barrer años enteros. */
  days: z.number().int().min(1).max(366).default(30),
})

export const adminDashboardKpis = createServerFn({ method: 'GET' })
  .validator(rangeSchema)
  .handler(async ({ data }): Promise<DashboardKpis> => {
    const to = new Date()
    const from = new Date(to.getTime() - data.days * 24 * 60 * 60 * 1_000)
    return dashboardKpis(await currentActor(), { from, to })
  })

async function currentActor(): Promise<AdminActor | null> {
  return resolveAdminActor(getCookie(ADMIN_SESSION_COOKIE))
}

// ─── Catálogo ───────────────────────────────────────────────────────────────

const productFiltersSchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
  featured: z.boolean().optional(),
  cursor: z.string().optional().nullable(),
  size: z.number().int().min(1).max(100).optional(),
})

export const adminListProducts = createServerFn({ method: 'GET' })
  .validator(productFiltersSchema)
  .handler(async ({ data }): Promise<{ items: AdminProductListItem[]; nextCursor: string | null; hasMore: boolean }> => {
    const page = await listAdminProducts(await currentActor(), data)
    return { items: [...page.items], nextCursor: page.nextCursor, hasMore: page.hasMore }
  })

const productInputSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'El slug solo admite minúsculas, números y guiones'),
  name: z.string().trim().min(2).max(120),
  categoryId: z.string().uuid(),
  shortDescription: z.string().trim().max(300).optional(),
  description: z.string().trim().max(4_000).optional(),
  featured: z.boolean().optional(),
})

export const adminCreateProduct = createServerFn({ method: 'POST' })
  .validator(productInputSchema)
  .handler(async ({ data }): Promise<{ id: string }> =>
    createAdminProduct(await currentActor(), data),
  )

const productPatchSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(120).optional(),
  shortDescription: z.string().trim().max(300).nullable().optional(),
  description: z.string().trim().max(4_000).nullable().optional(),
  categoryId: z.string().uuid().optional(),
  featured: z.boolean().optional(),
  seoTitle: z.string().trim().max(160).nullable().optional(),
  seoDescription: z.string().trim().max(320).nullable().optional(),
})

export const adminUpdateProduct = createServerFn({ method: 'POST' })
  .validator(productPatchSchema)
  .handler(async ({ data }): Promise<{ changed: string[] }> =>
    updateAdminProduct(await currentActor(), data),
  )

export const adminSetProductStatus = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().uuid(),
      status: z.enum(['draft', 'active', 'archived']),
    }),
  )
  .handler(async ({ data }): Promise<{ status: string }> => {
    const result = await setAdminProductStatus(await currentActor(), data)
    return { status: result.status }
  })

// ─── Inventario ─────────────────────────────────────────────────────────────

export const adminListInventory = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      filter: z.enum(['all', 'low', 'out']).default('all'),
      cursor: z.string().optional().nullable(),
      size: z.number().int().min(1).max(100).optional(),
    }),
  )
  .handler(async ({ data }): Promise<{ items: AdminInventoryRow[]; nextCursor: string | null; hasMore: boolean }> => {
    const page = await listAdminInventory(await currentActor(), data)
    return { items: [...page.items], nextCursor: page.nextCursor, hasMore: page.hasMore }
  })

export const adminAdjustInventory = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      variantId: z.string().uuid(),
      delta: z.number().int().refine((value) => value !== 0, 'El ajuste no puede ser cero'),
      reason: z.enum(['purchase', 'return', 'adjustment', 'correction']),
      note: z.string().trim().max(300).optional(),
    }),
  )
  .handler(async ({ data }): Promise<AdminInventoryRow> =>
    adjustAdminInventory(await currentActor(), data),
  )

// ─── Auditoría ──────────────────────────────────────────────────────────────

export const adminListAudit = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      entity: z.string().trim().max(60).optional(),
      entityId: z.string().trim().max(80).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    }),
  )
  .handler(async ({ data }): Promise<AuditListItem[]> => listAuditEntries(await currentActor(), data))

// ─── Pedidos ────────────────────────────────────────────────────────────────

const orderStatusSchema = z.enum([
  'draft',
  'placed',
  'paid',
  'fulfilled',
  'cancelled',
  'refunded',
])

export const adminListOrders = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      status: orderStatusSchema.optional(),
      q: z.string().trim().max(120).optional(),
      /** ISO date; el rango se acota para no barrer la tabla entera. */
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      cursor: z.string().optional().nullable(),
      size: z.number().int().min(1).max(100).optional(),
    }),
  )
  .handler(async ({ data }): Promise<{ items: AdminOrderListItem[]; nextCursor: string | null; hasMore: boolean }> => {
    const page = await listAdminOrders(await currentActor(), {
      ...data,
      from: data.from ? new Date(data.from) : undefined,
      to: data.to ? new Date(data.to) : undefined,
    })
    return { items: [...page.items], nextCursor: page.nextCursor, hasMore: page.hasMore }
  })

export const adminGetOrder = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }): Promise<AdminOrderDetail> =>
    getAdminOrder(await currentActor(), data.id),
  )

export const adminUpdateOrderStatus = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().uuid(),
      to: orderStatusSchema,
      note: z.string().trim().max(300).optional(),
    }),
  )
  .handler(async ({ data }): Promise<{ from: string; to: string }> =>
    updateAdminOrderStatus(await currentActor(), data),
  )

export const adminRefundOrder = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().uuid(),
      amountCents: z.number().int().positive(),
      reason: z.string().trim().min(3).max(300),
    }),
  )
  .handler(async ({ data }): Promise<{ refundedCents: number; status: string }> =>
    refundAdminOrder(await currentActor(), data),
  )

// ─── Clientes ───────────────────────────────────────────────────────────────

export const adminListCustomers = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      q: z.string().trim().max(120).optional(),
      cursor: z.string().optional().nullable(),
      size: z.number().int().min(1).max(100).optional(),
    }),
  )
  .handler(async ({ data }): Promise<{ items: AdminCustomerListItem[]; nextCursor: string | null; hasMore: boolean }> => {
    const page = await listAdminCustomers(await currentActor(), data)
    return { items: [...page.items], nextCursor: page.nextCursor, hasMore: page.hasMore }
  })

export const adminGetCustomer = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }): Promise<AdminCustomerDetail> =>
    getAdminCustomer(await currentActor(), data.id),
  )

// ─── Variantes y categorías ─────────────────────────────────────────────────

export const adminGetProduct = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }): Promise<AdminProductDetail> =>
    getAdminProduct(await currentActor(), data.id),
  )

const variantSchema = z.object({
  productId: z.string().uuid(),
  id: z.string().uuid().optional(),
  sku: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[A-Za-z0-9._-]+$/, 'El SKU solo admite letras, números, punto, guion y guion bajo'),
  size: z.string().trim().max(30).default('Única'),
  color: z.string().trim().min(2).max(40),
  priceCents: z.number().int().nonnegative(),
  compareAtPriceCents: z.number().int().nonnegative().nullable().optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
})

export const adminUpsertVariant = createServerFn({ method: 'POST' })
  .validator(variantSchema)
  .handler(async ({ data }): Promise<{ id: string; created: boolean }> =>
    upsertAdminVariant(await currentActor(), data),
  )

export const adminDeleteVariant = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }): Promise<{ deleted: boolean; archived: boolean }> =>
    deleteAdminVariant(await currentActor(), data.id),
  )

export const adminListCategories = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AdminCategoryRow[]> => listAdminCategories(await currentActor()),
)

const categorySchema = z.object({
  id: z.string().uuid().optional(),
  parentId: z.string().uuid().nullable().optional(),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'El slug solo admite minúsculas, números y guiones'),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  position: z.number().int().min(0).max(9_999).optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
})

export const adminUpsertCategory = createServerFn({ method: 'POST' })
  .validator(categorySchema)
  .handler(async ({ data }): Promise<{ id: string; created: boolean }> =>
    upsertAdminCategory(await currentActor(), data),
  )

// ─── Ajustes, contenido y usuarios ──────────────────────────────────────────

export const adminListSettings = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AdminSettingRow[]> => listAdminSettings(await currentActor()),
)

export const adminUpdateSetting = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      key: z.string().trim().min(2).max(60),
      value: z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
      ]),
      type: z.enum(['string', 'number', 'boolean', 'json']).optional(),
    }),
  )
  .handler(async ({ data }): Promise<AdminSettingRow> =>
    updateAdminSetting(await currentActor(), {
      key: data.key,
      value: data.value,
      type: data.type,
    }),
  )

export const adminListContent = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AdminContentRow[]> => listAdminContent(await currentActor()),
)

const contentSchema = z.object({
  kind: z.enum(['section', 'banner']),
  id: z.string().uuid().optional(),
  key: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/, 'La clave solo admite minúsculas, números y guiones'),
  title: z.string().trim().max(120).nullable().optional(),
  subtitle: z.string().trim().max(240).nullable().optional(),
  ctaLabel: z.string().trim().max(40).nullable().optional(),
  ctaHref: z.string().trim().max(300).nullable().optional(),
  placement: z.enum(['home', 'home_hero', 'shop', 'checkout']).optional(),
  position: z.number().int().min(0).max(9_999).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
})

export const adminUpsertContent = createServerFn({ method: 'POST' })
  .validator(contentSchema)
  .handler(async ({ data }): Promise<{ id: string; created: boolean }> =>
    upsertAdminContent(await currentActor(), data),
  )

export const adminListUsers = createServerFn({ method: 'GET' })
  .validator(z.object({ q: z.string().trim().max(120).optional() }))
  .handler(async ({ data }): Promise<AdminUserRow[]> =>
    listAdminUsers(await currentActor(), data),
  )

export const adminListRoles = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Array<{ key: string; name: string; permissionCount: number }>> =>
    listAdminRoles(await currentActor()),
)

export const adminAssignRole = createServerFn({ method: 'POST' })
  .validator(z.object({ userId: z.string().uuid(), roleKey: z.string().trim().min(2).max(40) }))
  .handler(async ({ data }): Promise<{ ok: true }> => assignAdminRole(await currentActor(), data))

export const adminRevokeRole = createServerFn({ method: 'POST' })
  .validator(z.object({ userId: z.string().uuid(), roleKey: z.string().trim().min(2).max(40) }))
  .handler(async ({ data }): Promise<{ ok: true }> => revokeAdminRole(await currentActor(), data))

/** DTOs para el cliente (solo tipos: se borran al compilar). */
export type { AdminActor } from '@/server/services/admin/actor'
export type {
  AdminCategoryRow,
  AdminInventoryRow,
  AdminProductDetail,
  AdminProductListItem,
  AdminVariant,
  AuditListItem,
  DashboardKpis,
} from '@/server/services/admin/catalog-admin'
export type {
  AdminContentRow,
  AdminSettingRow,
  AdminUserRow,
  SettingType,
} from '@/server/services/admin/content-admin'
export type {
  AdminCustomerDetail,
  AdminCustomerListItem,
  AdminOrderDetail,
  AdminOrderListItem,
} from '@/server/services/admin/orders-admin'