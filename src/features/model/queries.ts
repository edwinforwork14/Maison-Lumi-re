/**
 * Claves de consulta del storefront, centralizadas (Plan 02 §4 y Plan 03 §9).
 *
 * Son el **contrato de invalidación de caché**: cada mutación del panel
 * declara qué clave invalida, y el storefront sólo usa claves de aquí. Un
 * literal de clave suelto rompe el contrato en silencio (la tienda mostraría
 * datos obsoletos tras un cambio del panel).
 *
 * `docs/conventions.md` documenta la tabla clave → staleTime → quién invalida.
 */

export const queryKeys = {
  /** Catálogo de la tienda, segmentado por los filtros de la URL. */
  products: (...filters: readonly unknown[]) => ['products', ...filters] as const,
  /** Ficha de un producto por slug (quick-view). */
  product: (slug: string) => ['product', slug] as const,
  /** Categorías (migas del quick-view). */
  categories: () => ['categories'] as const,
  /** Relacionados de una ficha. */
  related: (slug: string) => ['related', slug] as const,
  /** Ajustes públicos (umbral de envío, WhatsApp…): los edita el panel. */
  siteSettings: () => ['site-settings'] as const,
  /** Cotización del carrito: por líneas, método de envío y cupón. */
  cartQuote: (lines: readonly unknown[], shipping: string, coupon: string) =>
    ['cart-quote', lines, shipping, coupon] as const,
  /** Pedidos de la cuenta: sólo desde la sesión del servidor (D31). */
  myOrders: () => ['my-orders'] as const,
  /** Sesión del storefront. */
  session: () => ['session'] as const,
  /** Wishlist del servidor (autenticado). */
  wishlist: () => ['wishlist'] as const,
  /** Productos de la wishlist por ids (caché local de la página). */
  wishlistProducts: (ids: readonly string[]) => ['wishlist-products', [...ids]] as const,
  /** Contenido de portada publicado por el panel. */
  content: () => ['content'] as const,
} as const
