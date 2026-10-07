/**
 * Superficie cliente↔servidor del panel administrativo (Plan 02 §4).
 *
 * Mismo patrón que `features/commerce.api.ts`: server functions con Zod en toda
 * entrada, sesión resuelta en servidor y nada de acceso directo a la base desde
 * el navegador. Cada handler delega en `server/services/admin/*`, que es quien
 * exige el permiso.
 */

import { createServerFn } from '@tanstack/react-start'
import { getCookie, getRequest, setCookie } from '@tanstack/react-start/server'
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
  createAdminProductWithVariant,
  createAdminProductWithVariants,
  dashboardKpis,
  deleteAdminVariant,
  getAdminProduct,
  listAdminBrands,
  listAdminCategories,
  listAdminCollections,
  listAdminInventory,
  listAdminProducts,
  listAuditEntries,
  reorderAdminCatalog,
  setAdminProductStatus,
  updateAdminProduct,
  upsertAdminBrand,
  upsertAdminCategory,
  upsertAdminCollection,
  upsertAdminVariant,
  type AdminCategoryRow,
  type AdminInventoryRow,
  type AdminMediaItem,
  type AdminProductDetail,
  type AdminProductListItem,
  type AdminTaxonomyRow,
  type AuditListItem,
  type DashboardKpis,
} from '@/server/services/admin/catalog-admin'
import {
  listAdminCoupons,
  listAdminReviews,
  moderateAdminReview,
  setAdminCouponStatus,
  upsertAdminCoupon,
  type AdminCouponRow,
  type AdminReviewRow,
  type CouponStatus,
  type ReviewStatus,
} from '@/server/services/admin/promotions-admin'
import {
  attachAdminMedia,
  createAdminUploadUrl,
  listAdminMedia,
  reorderAdminMedia,
  type UploadTicket,
} from '@/server/services/admin/media-admin'
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
import { createPostgresLoginThrottle } from '@/server/services/admin/login-throttle'
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
/** IP del cliente para el limitador (detrás de proxy, la primera de la cadena). */
function clientIp(): string | null {
  try {
    const headers = getRequest().headers
    const forwarded = headers.get('x-forwarded-for')
    if (forwarded) return forwarded.split(',')[0]!.trim()
    return headers.get('x-real-ip') ?? null
  } catch {
    return null
  }
}

export const adminLogin = createServerFn({ method: 'POST' })
  .validator(credentialsSchema)
  .handler(async ({ data }): Promise<{ userId: string }> => {
    const throttle = createPostgresLoginThrottle()
    const ip = clientIp()

    // 1) ¿Puede intentarlo? Se comprueba ANTES de verificar credenciales, para
    //    que un ataque por diccionario no llegue siquiera al hasher (caro).
    await throttle.assertAllowed({ scope: 'admin', email: data.email, ip })

    const user = await findActiveUserByEmail(data.email)
    if (!user || !verifyPassword(data.password, user.passwordHash)) {
      await throttle.record({ scope: 'admin', email: data.email, ip, succeeded: false })
      throw new AppError('UNAUTHENTICATED', 'Credenciales incorrectas')
    }

    // 2) Acceso correcto: se registra y se reinicia la ventana de fallos.
    await throttle.record({ scope: 'admin', email: data.email, ip, succeeded: true })
    await throttle.clearFailures('admin', data.email)

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

/**
 * Alta en un solo paso: producto + primera variante + stock, y opcionalmente
 * publicado. Es la vía normal del panel; `adminCreateProduct` queda para
 * scripts que quieran el borrador vacío.
 */
const productWithVariantSchema = productInputSchema.extend({
  variant: z.object({
    sku: z
      .string()
      .trim()
      .min(2)
      .max(60)
      .regex(/^[A-Za-z0-9._-]+$/, 'El SKU solo admite letras, números, punto, guion y guion bajo'),
    color: z.string().trim().min(2).max(40),
    size: z.string().trim().max(30).default('Única'),
    priceCents: z.number().int().nonnegative(),
    compareAtPriceCents: z.number().int().nonnegative().nullable().optional(),
    initialStock: z.number().int().nonnegative().max(1_000_000).default(0),
  }),
  publish: z.boolean().optional(),
})

export const adminCreateProductWithVariant = createServerFn({ method: 'POST' })
  .validator(productWithVariantSchema)
  .handler(
    async ({ data }): Promise<{ id: string; variantId: string; status: 'draft' | 'active' }> =>
      createAdminProductWithVariant(await currentActor(), data),
  )

/**
 * Alta completa estilo KAOZ: producto + marca (existente o creada) + varios
 * colores, cada uno con sus tallas, stock y SKU, en una sola llamada.
 */
const productVariantGroupSchema = z.object({
  color: z.string().trim().min(2).max(40),
  colorHex: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'El color debe ser hexadecimal #RRGGBB')
    .nullable()
    .optional(),
  sizes: z
    .array(
      z.object({
        size: z.string().trim().min(1).max(30),
        stock: z.number().int().nonnegative().max(1_000_000).default(0),
        sku: z
          .string()
          .trim()
          .min(2)
          .max(60)
          .regex(/^[A-Za-z0-9._-]+$/, 'El SKU solo admite letras, números, punto, guion y guion bajo')
          .nullable()
          .optional(),
      }),
    )
    .min(1)
    .max(60),
})

const productWithVariantsSchema = productInputSchema.extend({
  brandId: z.string().uuid().nullable().optional(),
  brandName: z.string().trim().min(2).max(80).nullable().optional(),
  priceCents: z.number().int().nonnegative(),
  compareAtPriceCents: z.number().int().nonnegative().nullable().optional(),
  publish: z.boolean().optional(),
  variants: z.array(productVariantGroupSchema).min(1).max(30),
})

export const adminCreateProductWithVariants = createServerFn({ method: 'POST' })
  .validator(productWithVariantsSchema)
  .handler(
    async ({ data }): Promise<{ id: string; status: 'draft' | 'active'; variantIds: string[] }> =>
      createAdminProductWithVariants(await currentActor(), data),
  )

const productPatchSchema = z.object({
  id: z.string().uuid(),
  /** Versión leída por el cliente (`updated_at` ISO): edición optimista. */
  version: z.string().datetime().optional(),
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
      version: z.string().datetime().optional(),
    }),
  )
  .handler(async ({ data }): Promise<{ status: string }> => {
    const result = await setAdminProductStatus(await currentActor(), data)
    return { status: result.status }
  })

/**
 * Publicación (nombres congelados en el Plan 02 §4; los consume el Plan 03
 * para su invalidación de caché). Publicar exige variantes y fija
 * `published_at`; archivar saca el producto de la venta sin borrarlo.
 */
const publicationSchema = z.object({
  id: z.string().uuid(),
  version: z.string().datetime().optional(),
})

export const adminPublishProduct = createServerFn({ method: 'POST' })
  .validator(publicationSchema)
  .handler(async ({ data }): Promise<{ status: string }> => {
    const result = await setAdminProductStatus(await currentActor(), { ...data, status: 'active' })
    return { status: result.status }
  })

export const adminArchiveProduct = createServerFn({ method: 'POST' })
  .validator(publicationSchema)
  .handler(async ({ data }): Promise<{ status: string }> => {
    const result = await setAdminProductStatus(await currentActor(), { ...data, status: 'archived' })
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

export const adminListAuditLog = createServerFn({ method: 'GET' })
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

// ─── Media (Plan 02 §4) ───────────────────────────────────────────────────

export const adminCreateUploadUrl = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      filename: z.string().trim().min(1).max(120),
      contentType: z.string().trim().min(3).max(80),
      sizeBytes: z.number().int().positive(),
    }),
  )
  .handler(async ({ data }): Promise<UploadTicket> => createAdminUploadUrl(await currentActor(), data))

export const adminListMedia = createServerFn({ method: 'GET' })
  .validator(z.object({ productId: z.string().uuid() }))
  .handler(async ({ data }) => listAdminMedia(await currentActor(), data.productId))

export const adminAttachMedia = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      productId: z.string().uuid(),
      variantId: z.string().uuid().nullable().optional(),
      storageKey: z.string().trim().min(3).max(600),
      alt: z.string().trim().min(1).max(200),
      width: z.number().int().positive().max(20_000).optional(),
      height: z.number().int().positive().max(20_000).optional(),
      position: z.number().int().min(0).max(999).optional(),
    }),
  )
  .handler(async ({ data }): Promise<{ id: string }> => attachAdminMedia(await currentActor(), data))

export const adminReorderMedia = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      productId: z.string().uuid(),
      ids: z.array(z.string().uuid()).min(1).max(100),
    }),
  )
  .handler(async ({ data }): Promise<{ updated: number }> =>
    reorderAdminMedia(await currentActor(), data),
  )

export const adminListBrands = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AdminTaxonomyRow[]> => listAdminBrands(await currentActor()),
)

export const adminListCollections = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AdminTaxonomyRow[]> => listAdminCollections(await currentActor()),
)

const taxonomySchema = z.object({
  id: z.string().uuid().optional(),
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

export const adminUpsertBrand = createServerFn({ method: 'POST' })
  .validator(taxonomySchema)
  .handler(async ({ data }): Promise<{ id: string; created: boolean }> =>
    upsertAdminBrand(await currentActor(), data),
  )

export const adminUpsertCollection = createServerFn({ method: 'POST' })
  .validator(taxonomySchema)
  .handler(async ({ data }): Promise<{ id: string; created: boolean }> =>
    upsertAdminCollection(await currentActor(), data),
  )

export const adminReorderCatalog = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      kind: z.enum(['category', 'brand', 'collection']),
      ids: z.array(z.string().uuid()).min(1).max(500),
    }),
  )
  .handler(async ({ data }): Promise<{ updated: number }> =>
    reorderAdminCatalog(await currentActor(), data),
  )

// ─── Cupones y reseñas (Plan 02 §4, §8) ─────────────────────────────────────

export const adminListCoupons = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      q: z.string().trim().max(60).optional(),
      status: z.enum(['active', 'paused', 'expired', 'archived']).optional(),
      cursor: z.string().optional().nullable(),
      size: z.number().int().min(1).max(100).optional(),
    }),
  )
  .handler(async ({ data }): Promise<{ items: AdminCouponRow[]; nextCursor: string | null; hasMore: boolean }> => {
    const page = await listAdminCoupons(await currentActor(), data)
    return { items: [...page.items], nextCursor: page.nextCursor, hasMore: page.hasMore }
  })

const couponSchema = z
  .object({
    id: z.string().uuid().optional(),
    code: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9_-]+$/, 'El código solo admite letras, números, guion y guion bajo'),
    kind: z.enum(['percent', 'fixed', 'free_shipping']),
    value: z.number().int().nonnegative(),
    minSubtotalCents: z.number().int().nonnegative().optional(),
    maxUses: z.number().int().positive().nullable().optional(),
    maxUsesPerCustomer: z.number().int().positive().nullable().optional(),
    /** ISO date: la frontera llega como texto y se convierte aquí. */
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().nullable().optional(),
    status: z.enum(['active', 'paused', 'expired', 'archived']).optional(),
  })
  .refine((value) => value.kind !== 'percent' || (value.value >= 1 && value.value <= 100), {
    message: 'Un cupón por porcentaje vale entre 1 y 100',
    path: ['value'],
  })
  .refine((value) => value.kind !== 'fixed' || value.value > 0, {
    message: 'Un cupón fijo necesita un importe en céntimos mayor que cero',
    path: ['value'],
  })
  .refine((value) => value.kind !== 'free_shipping' || value.value === 0, {
    message: 'El cupón de envío gratuito no lleva valor',
    path: ['value'],
  })

export const adminUpsertCoupon = createServerFn({ method: 'POST' })
  .validator(couponSchema)
  .handler(async ({ data }): Promise<{ id: string; created: boolean }> =>
    upsertAdminCoupon(await currentActor(), {
      ...data,
      startsAt: data.startsAt ? new Date(data.startsAt) : undefined,
      endsAt: data.endsAt === undefined ? undefined : data.endsAt === null ? null : new Date(data.endsAt),
    }),
  )

export const adminSetCouponStatus = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().uuid(), status: z.enum(['active', 'paused', 'expired', 'archived']) }))
  .handler(async ({ data }): Promise<{ status: CouponStatus }> =>
    setAdminCouponStatus(await currentActor(), data),
  )

export const adminListReviews = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      status: z.enum(['pending', 'approved', 'rejected']).optional(),
      productId: z.string().uuid().optional(),
      cursor: z.string().optional().nullable(),
      size: z.number().int().min(1).max(100).optional(),
    }),
  )
  .handler(async ({ data }): Promise<{ items: AdminReviewRow[]; nextCursor: string | null; hasMore: boolean }> => {
    const page = await listAdminReviews(await currentActor(), data)
    return { items: [...page.items], nextCursor: page.hasMore ? page.nextCursor : null, hasMore: page.hasMore }
  })

export const adminModerateReview = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().uuid(),
      status: z.enum(['pending', 'approved', 'rejected']),
      note: z.string().trim().max(300).optional(),
    }),
  )
  .handler(async ({ data }): Promise<{ status: ReviewStatus }> =>
    moderateAdminReview(await currentActor(), data),
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

/**
 * Nombres congelados del Plan 02 §4: cada tipo de contenido tiene su función y
 * su clave de invalidación (`content` para el Plan 03).
 */
export const adminUpsertHomepageSection = createServerFn({ method: 'POST' })
  .validator(contentSchema.omit({ kind: true }))
  .handler(async ({ data }): Promise<{ id: string; created: boolean }> =>
    upsertAdminContent(await currentActor(), { ...data, kind: 'section' }),
  )

export const adminUpsertBanner = createServerFn({ method: 'POST' })
  .validator(contentSchema.omit({ kind: true }))
  .handler(async ({ data }): Promise<{ id: string; created: boolean }> =>
    upsertAdminContent(await currentActor(), { ...data, kind: 'banner' }),
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
  AdminMediaItem,
  AdminProductDetail,
  AdminProductListItem,
  AdminTaxonomyRow,
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