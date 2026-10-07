import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { z } from 'zod'
import { cartCount as countLines, cartReducer, type CartLine } from '@/domain/cart'

/**
 * Estado de cliente del carrito y la wishlist (plan.md §5.4).
 *
 * El carrito guarda **solo líneas** (`productId`, `color`, `quantity`): no hay
 * ningún importe aquí. Los precios, el envío, el descuento y el total son
 * competencia exclusiva del servidor (`quoteCart`), que es la única fuente de
 * verdad del dinero (defecto D5).
 *
 * La identidad del usuario NO vive aquí: vive en la sesión de servidor
 * (cookie httpOnly). El cliente nunca persiste datos personales (defecto D6).
 */

// ─── Persistencia versionada y validada (frontera externa ⇒ Zod) ─────────────

const CART_KEY = 'ml.cart.v2'
const CART_KEY_LEGACY = 'ml.cart.v1'
const WISH_KEY = 'ml.wishlist.v1'

const cartLineSchema = z.object({
  productId: z.string().min(1),
  color: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
})

const cartSchema = z.array(cartLineSchema)
const wishlistSchema = z.array(z.string().min(1))

function load<T>(key: string, schema: z.ZodType<T>, fallback: T, legacyKey?: string): T {
  if (typeof window === 'undefined') return fallback
  for (const candidate of legacyKey ? [key, legacyKey] : [key]) {
    try {
      const raw = window.localStorage.getItem(candidate)
      if (!raw) continue
      const parsed = schema.safeParse(JSON.parse(raw))
      // Dato corrupto o manipulado: se descarta en lugar de romper la UI.
      if (parsed.success) return parsed.data
    } catch {
      // almacenamiento no disponible (SSR / modo privado): seguir
    }
  }
  return fallback
}

function save(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // almacenamiento no disponible (SSR / private mode): ignorar
  }
}

// ─── Contexto ───────────────────────────────────────────────────────────────

interface StoreContextValue {
  cart: readonly CartLine[]
  cartCount: number
  cartOpen: boolean
  setCartOpen: (open: boolean) => void
  addToCart: (productId: string, color: string, quantity?: number) => void
  updateQuantity: (productId: string, color: string, quantity: number) => void
  removeFromCart: (productId: string, color: string) => void
  clearCart: () => void
  /**
   * Descarta las líneas que el servidor ya no reconoce (producto retirado o
   * id de una versión anterior del catálogo). Evita que el contador muestre
   * piezas que no se pueden cotizar.
   */
  reconcileCart: (validKeys: ReadonlySet<string>) => void
  wishlist: readonly string[]
  toggleWishlist: (productId: string) => void
  isWishlisted: (productId: string) => boolean
}

const StoreContext = createContext<StoreContextValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<readonly CartLine[]>(() =>
    load(CART_KEY, cartSchema, [], CART_KEY_LEGACY),
  )
  const [wishlist, setWishlist] = useState<readonly string[]>(() =>
    load(WISH_KEY, wishlistSchema, []),
  )
  const [cartOpen, setCartOpen] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated) save(CART_KEY, cart)
  }, [cart, hydrated])
  useEffect(() => {
    if (hydrated) save(WISH_KEY, wishlist)
  }, [wishlist, hydrated])

  const addToCart = useCallback(
    (productId: string, color: string, quantity = 1) => {
      setCart((prev) => cartReducer(prev, { type: 'add', productId, color, quantity }))
      setCartOpen(true)
    },
    [],
  )

  const updateQuantity = useCallback(
    (productId: string, color: string, quantity: number) => {
      setCart((prev) =>
        cartReducer(prev, { type: 'setQuantity', productId, color, quantity }),
      )
    },
    [],
  )

  const removeFromCart = useCallback((productId: string, color: string) => {
    setCart((prev) => cartReducer(prev, { type: 'remove', productId, color }))
  }, [])

  const clearCart = useCallback(() => setCart([]), [])

  const reconcileCart = useCallback((validKeys: ReadonlySet<string>) => {
    setCart((prev) => {
      const next = prev.filter((line) => validKeys.has(`${line.productId}::${line.color}`))
      // Sin cambios se devuelve el MISMO array: evita un bucle de re-render.
      return next.length === prev.length ? prev : next
    })
  }, [])

  const toggleWishlist = useCallback((productId: string) => {
    setWishlist((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId],
    )
  }, [])

  const isWishlisted = useCallback(
    (productId: string) => wishlist.includes(productId),
    [wishlist],
  )

  const value = useMemo<StoreContextValue>(
    () => ({
      cart,
      cartCount: countLines(cart),
      cartOpen,
      setCartOpen,
      addToCart,
      updateQuantity,
      removeFromCart,
      clearCart,
      reconcileCart,
      wishlist,
      toggleWishlist,
      isWishlisted,
    }),
    [
      cart,
      cartOpen,
      addToCart,
      updateQuantity,
      removeFromCart,
      clearCart,
      reconcileCart,
      wishlist,
      toggleWishlist,
      isWishlisted,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore debe usarse dentro de <StoreProvider>')
  return ctx
}
