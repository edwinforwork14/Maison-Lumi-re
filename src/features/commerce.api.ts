/**
 * Server functions del comercio (plan.md §4.2, Fase 2).
 *
 * Superficie única cliente↔servidor: toda entrada se valida con Zod, toda
 * lectura es GET y toda escritura POST. Los componentes nunca importan
 * datos directamente: llaman a estas funciones (regla de oro 8).
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { catalogRepository } from '@/server/seed/catalog'
import {
  placeOrder as placeOrderService,
  quoteCart as quoteCartService,
  type CartQuote,
  type ServerOrder,
} from '@/server/services/commerce'
import {
  createSessionCookie,
  destroySession,
  getSessionUser,
  requireSessionUser,
  login as loginService,
  register as registerService,
  type SessionUser,
} from '@/server/session/store'
import { AppError } from '@/server/errors'
import { isPostgresDataSource } from '@/server/runtime/env'
import type { CatalogFilters, SortId } from '@/domain/catalog'
import type { Money } from '@/domain/money'
import type { Product } from '@/data/types'

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
    if (isPostgresDataSource()) {
      const { quoteCartFromDb } = await import('@/server/services/storefront-orders')
      return quoteCartFromDb(data)
    }
    return quoteCartService(data)
  })

export const placeOrder = createServerFn({ method: 'POST' })
  .validator(placeOrderSchema)
  .handler(async ({ data }): Promise<{ orderNumber: string; total: Money }> => {
    // Si hay sesión, el pedido se registra a nombre de esa cuenta: el email del
    // formulario no puede suplantar a otro cliente.
    const sessionUser = getSessionUser()
    const customer = { ...data.customer, email: sessionUser?.email ?? data.customer.email }

    if (isPostgresDataSource()) {
      // Camino real: transacción con reserva de stock y compromiso del pago
      // simulado. Es lo que hace que una venta descuente existencias (D25).
      const { placeStorefrontOrder } = await import('@/server/services/storefront-orders')
      const placed = await placeStorefrontOrder({
        email: customer.email,
        lines: data.lines,
        shippingMethod: data.shippingMethod,
        customer,
        idempotencyKey: data.idempotencyKey,
      })
      return { orderNumber: placed.orderNumber, total: placed.total }
    }

    const order = placeOrderService({
      ...data,
      customer,
    })
    return { orderNumber: order.number, total: order.totals.total }
  })

/**
 * Pedidos del usuario autenticado.
 *
 * Defecto D31: antes aceptaba un `email` del cliente y devolvía los pedidos de
 * quien fuera. Ahora **no admite argumentos**: el email sale de la sesión de
 * servidor, así que no hay nada que manipular desde el navegador.
 */
export const listMyOrders = createServerFn({ method: 'GET' }).handler(async () => {
  const user = requireSessionUser()
  if (isPostgresDataSource()) {
    const { listStorefrontOrders } = await import('@/server/services/storefront-orders')
    return listStorefrontOrders(user.email)
  }
  const { listOrdersByCustomer } = await import('@/server/services/commerce')
  return listOrdersByCustomer(user.email)
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
  .handler(async ({ data }): Promise<ServerOrder | null> => {
    const user = getSessionUser()
    if (!user) throw new AppError('UNAUTHENTICATED', 'Sesión requerida')

    if (isPostgresDataSource()) {
      // La propiedad se comprueba en la propia consulta: si el email no
      // coincide no hay fila, así que no se distingue «no existe» de «no es tuyo».
      const { findStorefrontOrderForOwner } = await import('@/server/services/storefront-orders')
      const order = await findStorefrontOrderForOwner(data.orderNumber, user.email)
      if (!order) throw new AppError('NOT_FOUND', 'Pedido no encontrado')
      return order as unknown as ServerOrder
    }

    const { findOrderByNumber, ownsOrder } = await import('@/server/services/commerce')
    const order = findOrderByNumber(data.orderNumber)
    if (!order || !ownsOrder(order, user.email)) {
      throw new AppError('NOT_FOUND', 'Pedido no encontrado')
    }
    return order
  })

// ─── Sesión (defecto D6: la autoridad es el servidor) ────────────────────────

export const getSession = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{ user: SessionUser | null }> => {
    return { user: getSessionUser() }
  },
)

export const loginFn = createServerFn({ method: 'POST' })
  .validator(credentialsSchema)
  .handler(async ({ data }): Promise<SessionUser> => {
    const user = loginService(data.email, data.password)
    createSessionCookie(user)
    return user
  })

export const registerFn = createServerFn({ method: 'POST' })
  .validator(registerSchema)
  .handler(async ({ data }): Promise<SessionUser> => {
    const user = registerService({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      password: data.password,
    })
    createSessionCookie(user)
    return user
  })

export const logoutFn = createServerFn({ method: 'POST' }).handler(async () => {
  destroySession()
  return { ok: true }
})


// re-export del tipo SortId para consumers de la API
export type { SortId }

/**
 * DTOs del comercio para el cliente (solo tipos: se borran al compilar).
 * El cliente nunca importa `@/server/**`: consume estos tipos a través de la
 * superficie pública que es este archivo.
 */
export type { CartQuote, QuoteLine, ShippingOptionQuote } from '@/server/services/commerce'
