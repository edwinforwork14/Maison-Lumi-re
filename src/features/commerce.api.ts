/**
 * Server functions del comercio (plan.md §4.2, Fase 2).
 *
 * Superficie única cliente↔servidor: toda entrada se valida con Zod, toda
 * lectura es GET y toda escritura POST. Los componentes nunca importan
 * datos directamente: llaman a estas funciones (regla de oro 8).
 */

import { createServerFn } from '@tanstack/react-start'
import { getCookie, getRequest, setCookie } from '@tanstack/react-start/server'
import { z } from 'zod'
import { catalogRepository } from '@/server/seed/catalog'
import type { CartQuote } from '@/server/services/cart-quote'
import type { HomepageContent } from '@/server/services/storefront-content'
import type { SessionUser } from '@/server/services/storefront-auth'
import { AppError } from '@/server/errors'
import { isPostgresDataSource } from '@/server/runtime/env'
import type { CatalogFilters, SortId } from '@/domain/catalog'
import type { Money } from '@/domain/money'
import type { Product } from '@/domain/catalog/types'

// ─── Esquemas de entrada (Zod en toda frontera) ─────────────────────────────

export const catalogFiltersSchema = z.object({
  category: z.string().optional(),
  collection: z.string().optional(),
  colors: z.array(z.string()).optional(),
  materials: z.array(z.string()).optional(),
  /** Cotas de precio en céntimos (enteros): nunca euros decimales. */
  priceMinCents: z.number().int().nonnegative().optional(),
  priceMaxCents: z.number().int().nonnegative().optional(),
  sort: z
    .enum(['recommended', 'price-asc', 'price-desc', 'bestsellers', 'new'])
    .optional(),
  search: z.string().optional(),
})

export type CatalogFiltersInput = z.infer<typeof catalogFiltersSchema>

const quoteInputSchema = z.object({
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        color: z.string().min(1),
        quantity: z.number().int().min(0).max(99),
      }),
    )
    .max(50),
  shippingMethod: z.enum(['standard', 'express']).optional(),
  /** Código de descuento: se valida y aplica en el servidor (Plan 03 §3). */
  couponCode: z.string().trim().max(40).optional(),
})

const placeOrderSchema = quoteInputSchema.extend({
  customer: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    address: z.string().min(1),
    city: z.string().min(1),
    postalCode: z.string().regex(/^\d{4,6}$/),
    country: z.string().min(1),
  }),
  idempotencyKey: z.string().min(8),
})

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4),
})

const registerSchema = credentialsSchema.extend({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
})

// ─── Catálogo ────────────────────────────────────────────────────────────────

// Durante la migración strangler la API pública sigue hablando el tipo Product
// de data/types (la UI lo consume); en Fase 3 se sustituye por el modelo nuevo.
/**
 * Fuente del catálogo según el entorno: PostgreSQL si está configurada, y el
 * adaptador en memoria como respaldo (desarrollo sin base, tests de UI).
 * Los dos devuelven la misma forma, así que las plantillas no cambian.
 */
async function catalogSource() {
  if (isPostgresDataSource()) {
    const { createPostgresCatalogRepository } = await import(
      '@/server/db/repositories/catalog.postgres'
    )
    return createPostgresCatalogRepository()
  }
  return null
}

export const listProducts = createServerFn({ method: 'GET' })
  .validator(catalogFiltersSchema.optional())
  .handler(async ({ data }): Promise<Product[]> => {
    const filters = (data ?? {}) as CatalogFilters
    const source = await catalogSource()
    if (source) return (await source.search(filters)) as unknown as Product[]
    return catalogRepository.search(filters) as Product[]
  })

export const getProductBySlug = createServerFn({ method: 'GET' })
  .validator(z.object({ slug: z.string().min(1) }))
  .handler(async ({ data }) => {
    const source = await catalogSource()
    if (source) return (await source.findBySlug(data.slug)) ?? null
    return catalogRepository.findBySlug(data.slug) ?? null
  })

export const listCategories = createServerFn({ method: 'GET' }).handler(async () => {
  const source = await catalogSource()
  if (source) return source.listCategories()
  return catalogRepository.listCategories()
})

export const listCollections = createServerFn({ method: 'GET' }).handler(async () => {
  const source = await catalogSource()
  if (source) return source.listCollections()
  return catalogRepository.listCollections()
})

export const listFacets = createServerFn({ method: 'GET' }).handler(async () => {
  const source = await catalogSource()
  if (source) {
    return { colors: await source.listColors(), materials: await source.listMaterials() }
  }
  return {
    colors: catalogRepository.listColors(),
    materials: catalogRepository.listMaterials(),
  }
})

export const listProductsByIds = createServerFn({ method: 'GET' })
  .validator(z.object({ ids: z.array(z.string()).max(100) }))
  .handler(async ({ data }): Promise<Product[]> => {
    const source = await catalogSource()
    if (source) return (await source.findByIds(data.ids)) as unknown as Product[]
    return catalogRepository.findByIds(data.ids) as Product[]
  })

export const listRelatedProducts = createServerFn({ method: 'GET' })
  .validator(
    z.object({ slug: z.string().min(1), limit: z.number().int().min(1).max(8).optional() }),
  )
  .handler(async ({ data }): Promise<Product[]> => {
    const source = await catalogSource()
    const product = source
      ? await source.findBySlug(data.slug)
      : catalogRepository.findBySlug(data.slug)
    if (!product) return []
    const related = source
      ? await source.search({ category: product.category })
      : catalogRepository.search({ category: product.category })
    return related
      .filter((candidate) => (candidate as { id?: string }).id !== product.id)
      .slice(0, data.limit ?? 4) as unknown as Product[]
  })
// ─── Carrito y pedidos ───────────────────────────────────────────────────────

export const quoteCart = createServerFn({ method: 'POST' })
  .validator(quoteInputSchema)
  .handler(async ({ data }): Promise<CartQuote> => {
    const { quoteCartFromDb } = await import('@/server/services/storefront-orders')
    // La identidad sólo sirve para previsualizar el límite «usos por cliente»;
    // el límite real se comprueba en la transacción del pedido.
    const user = await currentStorefrontUser()
    return quoteCartFromDb({
      ...data,
      ...(user ? { email: user.email } : {}),
    })
  })

export const placeOrder = createServerFn({ method: 'POST' })
  .validator(placeOrderSchema)
  .handler(async ({ data }): Promise<{ orderNumber: string; total: Money }> => {
    // Si hay sesión, el pedido se registra a nombre de esa cuenta: el email del
    // formulario no puede suplantar a otro cliente.
    const sessionUser = await currentStorefrontUser()
    const customer = { ...data.customer, email: sessionUser?.email ?? data.customer.email }

    // Transacción con reserva de stock: es lo que hace que vender bloquee
    // existencias (D25). No hay camino alternativo en memoria.
    const { placeStorefrontOrder } = await import('@/server/services/storefront-orders')
    const placed = await placeStorefrontOrder({
      email: customer.email,
      lines: data.lines,
      shippingMethod: data.shippingMethod,
      couponCode: data.couponCode,
      customer,
      idempotencyKey: data.idempotencyKey,
    })
    return { orderNumber: placed.orderNumber, total: placed.total }
  })

/**
 * Pedidos del usuario autenticado.
 *
 * Defecto D31: antes aceptaba un `email` del cliente y devolvía los pedidos de
 * quien fuera. Ahora **no admite argumentos**: el email sale de la sesión de
 * servidor, así que no hay nada que manipular desde el navegador.
 */
export const listMyOrders = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await currentStorefrontUser()
  if (!user) throw new AppError('UNAUTHENTICATED', 'Sesión requerida')
  const { listStorefrontOrders } = await import('@/server/services/storefront-orders')
  return listStorefrontOrders(user.email)
})

/**
 * Detalle de un pedido propio.
 *
 * Defecto D32: antes era público y devolvía nombre, email y dirección de
 * cualquiera con solo cambiar el número. Ahora se comprueba la **propiedad**
 * contra la sesión: un pedido ajeno responde NOT_FOUND (no FORBIDDEN: no se
 * confirma siquiera que exista).
 */
export const getOrder = createServerFn({ method: 'GET' })
  .validator(z.object({ orderNumber: z.string().min(8).max(40) }))
  .handler(async ({ data }) => {
    const user = await currentStorefrontUser()
    if (!user) throw new AppError('UNAUTHENTICATED', 'Sesión requerida')

    // La propiedad se comprueba en la propia consulta: si el email no coincide no
    // hay fila, así que no se distingue «no existe» de «no es tuyo» (D32).
    const { findStorefrontOrderForOwner } = await import('@/server/services/storefront-orders')
    const order = await findStorefrontOrderForOwner(data.orderNumber, user.email)
    if (!order) throw new AppError('NOT_FOUND', 'Pedido no encontrado')
    return order
  })

// ─── Sesión (defecto D6/D40: la autoridad es el servidor) ────────────────────

/** Cookie de la tienda (separada de la del panel). */
const STOREFRONT_COOKIE = 'ml.session'
const STOREFRONT_TTL_SECONDS = 60 * 60 * 24 * 7

function storefrontIp(): string | null {
  try {
    const headers = getRequest().headers
    const forwarded = headers.get('x-forwarded-for')
    if (forwarded) return forwarded.split(',')[0]!.trim()
    return headers.get('x-real-ip') ?? null
  } catch {
    return null
  }
}

async function issueStorefrontSession(userId: string): Promise<void> {
  const { createPostgresSessionsRepository, resolveSessionSecret } = await import(
    '@/server/db/repositories/sessions.postgres'
  )
  const sessions = createPostgresSessionsRepository(undefined, resolveSessionSecret())
  const issued = await sessions.issue({
    userId,
    kind: 'storefront',
    ip: storefrontIp(),
  })
  setCookie(STOREFRONT_COOKIE, issued.cookieValue, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: STOREFRONT_TTL_SECONDS,
  })
}

/**
 * Usuario de la sesión actual, resuelto en el servidor.
 *
 * La identidad vive en `users` + `customers` y la sesión en la tabla `sessions`
 * (cookie firmada). No hay camino en memoria: el almacén que guardaba las
 * contraseñas en base64 se eliminó para que no pueda usarse por accidente.
 */
async function currentSession(): Promise<SessionContext | null> {
  const { createPostgresSessionsRepository, resolveSessionSecret } = await import(
    '@/server/db/repositories/sessions.postgres'
  )
  const sessions = createPostgresSessionsRepository(undefined, resolveSessionSecret())
  const session = await sessions.resolve(getCookie(STOREFRONT_COOKIE))
  if (!session || session.kind !== 'storefront') return null

  const { createPostgresStorefrontAuth } = await import('@/server/services/storefront-auth')
  const account = await createPostgresStorefrontAuth().currentUser(session.userId)
  if (!account) return null
  return {
    userId: session.userId,
    firstName: account.firstName,
    lastName: account.lastName,
    email: account.email,
  }
}

/** Sesión obligatoria: lanza `UNAUTHENTICATED` en lugar de devolver null. */
async function requireSession(): Promise<SessionContext> {
  const session = await currentSession()
  if (!session) throw new AppError('UNAUTHENTICATED', 'Sesión requerida')
  return session
}

async function currentStorefrontUser(): Promise<SessionUser | null> {
  const session = await currentSession()
  if (!session) return null
  return {
    firstName: session.firstName,
    lastName: session.lastName,
    email: session.email,
  }
}

export const getSession = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{ user: SessionUser | null }> => {
    return { user: await currentStorefrontUser() }
  },
)

export const loginFn = createServerFn({ method: 'POST' })
  .validator(credentialsSchema)
  .handler(async ({ data }): Promise<SessionUser> => {
    const { createPostgresStorefrontAuth } = await import('@/server/services/storefront-auth')
    const account = await createPostgresStorefrontAuth().login({
      email: data.email,
      password: data.password,
      context: { ip: storefrontIp() },
    })
    await issueStorefrontSession(account.id)
    return { firstName: account.firstName, lastName: account.lastName, email: account.email }
  })

export const registerFn = createServerFn({ method: 'POST' })
  .validator(registerSchema)
  .handler(async ({ data }): Promise<SessionUser> => {
    const { createPostgresStorefrontAuth } = await import('@/server/services/storefront-auth')
    const account = await createPostgresStorefrontAuth().register({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      password: data.password,
    })
    await issueStorefrontSession(account.id)
    return { firstName: account.firstName, lastName: account.lastName, email: account.email }
  })

export const logoutFn = createServerFn({ method: 'POST' }).handler(async () => {
  const { createPostgresSessionsRepository, resolveSessionSecret } = await import(
    '@/server/db/repositories/sessions.postgres'
  )
  const sessions = createPostgresSessionsRepository(undefined, resolveSessionSecret())
  await sessions.revoke(getCookie(STOREFRONT_COOKIE))
  setCookie(STOREFRONT_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  return { ok: true }
})


// ─── Wishlist y reseñas (Plan 03, S3) ─────────────────────────────────────

/** Contexto de sesión con el id: lo necesitan wishlist y reseñas. */
type SessionContext = SessionUser & { readonly userId: string }

/** Wishlist del titular. Sólo con sesión: no hay lista anónima en el servidor. */
export const listWishlist = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await requireSession()
  const { listWishlistProductIds } = await import('@/server/services/storefront-social')
  return listWishlistProductIds(session.userId)
})

export const toggleWishlist = createServerFn({ method: 'POST' })
  .validator(z.object({ productId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    const { toggleWishlistProduct } = await import('@/server/services/storefront-social')
    return toggleWishlistProduct(session.userId, data.productId)
  })

/** Reseñas públicas de un producto: sólo las aprobadas, sin datos personales. */
export const listProductReviews = createServerFn({ method: 'GET' })
  .validator(z.object({ productId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { listProductReviews: fetchReviews } = await import('@/server/services/storefront-social')
    return fetchReviews(data.productId)
  })

/**
 * Crear una reseña. Exige sesión y una línea de pedido **propia** entregada:
 * la compra es la que autoriza a opinar (Plan 03 §3).
 */
export const createReview = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      productId: z.string().min(1),
      orderItemId: z.string().uuid(),
      rating: z.number().int().min(1).max(5),
      title: z.string().trim().max(120).nullable().optional(),
      body: z.string().trim().max(2_000).nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession()
    const { createProductReview } = await import('@/server/services/storefront-social')
    return createProductReview({
      ...data,
      userId: session.userId,
      email: session.email,
    })
  })

// re-export del tipo SortId para consumers de la API
export type { SortId }

/**
 * DTOs del comercio para el cliente (solo tipos: se borran al compilar).
 * El cliente nunca importa `@/server/**`: consume estos tipos a través de la
 * superficie pública que es este archivo.
 */
export type { CartQuote, QuoteLine, ShippingOptionQuote } from '@/server/services/cart-quote'

// ─── Ajustes del sitio que consume la tienda ────────────────────────────────

export interface SiteSettings {
  readonly currency: string
  readonly locale: string
  readonly freeShippingThresholdCents: number
  readonly whatsappPhone: string | null
  readonly whatsappName: string | null
}

/**
 * Ajustes públicos del sitio (los edita el panel en «Ajustes»). El número de
 * WhatsApp es parte del flujo de compra: sin pasarela de pago, el pedido se
 * cierra por esa vía.
 */
export const getSiteSettings = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SiteSettings> => {
    const { readPublicSettings } = await import('@/server/services/storefront-orders')
    return readPublicSettings()
  },
)

// ─── Contenido de la portada (Plan 03 §6) ─────────────────────────────────────

export type { HomepageBlock, HomepageContent } from '@/server/services/storefront-content'

/**
 * Portada desde BD: secciones y banners publicados y vigentes del panel
 * («Contenido»). Sin BD configurada devuelve el contenido por defecto, así
 * que la home nunca se queda sin textos.
 */
export const getHomepage = createServerFn({ method: 'GET' }).handler(
  async (): Promise<HomepageContent> => {
    const { getHomepageContent } = await import('@/server/services/storefront-content')
    return getHomepageContent()
  },
)