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
  login as loginService,
  register as registerService,
  type SessionUser,
} from '@/server/session/store'
import { AppError } from '@/server/errors'
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
export const listProducts = createServerFn({ method: 'GET' })
  .validator(catalogFiltersSchema.optional())
  .handler(async ({ data }): Promise<Product[]> => {
    return catalogRepository.search((data ?? {}) as CatalogFilters) as Product[]
  })

export const getProductBySlug = createServerFn({ method: 'GET' })
  .validator(z.object({ slug: z.string().min(1) }))
  .handler(async ({ data }) => {
    return catalogRepository.findBySlug(data.slug) ?? null
  })

export const listCategories = createServerFn({ method: 'GET' }).handler(
  async () => catalogRepository.listCategories(),
)

export const listCollections = createServerFn({ method: 'GET' }).handler(
  async () => catalogRepository.listCollections(),
)

export const listFacets = createServerFn({ method: 'GET' }).handler(async () => ({
  colors: catalogRepository.listColors(),
  materials: catalogRepository.listMaterials(),
}))

export const listProductsByIds = createServerFn({ method: 'GET' })
  .validator(z.object({ ids: z.array(z.string()).max(100) }))
  .handler(async ({ data }): Promise<Product[]> => {
    return catalogRepository.findByIds(data.ids) as Product[]
  })

export const listRelatedProducts = createServerFn({ method: 'GET' })
  .validator(z.object({ slug: z.string().min(1), limit: z.number().int().min(1).max(8).optional() }))
  .handler(async ({ data }): Promise<Product[]> => {
    const product = catalogRepository.findBySlug(data.slug)
    if (!product) return []
    const related = catalogRepository
      .search({ category: product.category })
      .filter((p) => (p as { id?: string }).id !== product.id)
    return related.slice(0, data.limit ?? 4) as Product[]
  })

// ─── Carrito y pedidos ───────────────────────────────────────────────────────

export const quoteCart = createServerFn({ method: 'POST' })
  .validator(quoteInputSchema)
  .handler(async ({ data }): Promise<CartQuote> => {
    return quoteCartService(data)
  })

export const placeOrder = createServerFn({ method: 'POST' })
  .validator(placeOrderSchema)
  .handler(async ({ data }): Promise<{ orderNumber: string; total: Money }> => {
    const order = placeOrderService(data)
    return { orderNumber: order.number, total: order.totals.total }
  })

export const listMyOrders = createServerFn({ method: 'GET' })
  .validator(z.object({ email: z.string().email() }))
  .handler(async ({ data }) => {
    const { listOrdersByCustomer } = await import('@/server/services/commerce')
    return listOrdersByCustomer(data.email)
  })

export const getOrder = createServerFn({ method: 'GET' })
  .validator(z.object({ orderNumber: z.string().min(1) }))
  .handler(async ({ data }): Promise<ServerOrder | null> => {
    const { findOrderByNumber } = await import('@/server/services/commerce')
    return findOrderByNumber(data.orderNumber) ?? null
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

/** Helper para guards de ruta: lanza redirect si no hay sesión. */
export async function requireUser(): Promise<SessionUser> {
  const { user } = await getSession()
  if (!user) {
    throw new AppError('UNAUTHENTICATED', 'Sesión requerida')
  }
  return user
}

// re-export del tipo SortId para consumers de la API
export type { SortId }

/**
 * DTOs del comercio para el cliente (solo tipos: se borran al compilar).
 * El cliente nunca importa `@/server/**`: consume estos tipos a través de la
 * superficie pública que es este archivo.
 */
export type { CartQuote, QuoteLine, ShippingOptionQuote } from '@/server/services/commerce'
