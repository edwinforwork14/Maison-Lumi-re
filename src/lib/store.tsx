import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { getProductById } from '../data/productLookup'
import type { CartItem, CartTotals, Product, UserAccount } from '../data/types'
import { shippingCostFor } from '../data/shipping'
import { cartReducer, type CartLine } from '@/domain/cart'

// ─── Persistencia ────────────────────────────────────────────────────────────

function load<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // almacenamiento no disponible (SSR / private mode): ignorar
  }
}

const toLines = (cart: readonly CartItem[]): CartLine[] =>
  cart.map((i) => ({ productId: i.productId, color: i.color, quantity: i.quantity }))

const toItems = (lines: readonly CartLine[]): CartItem[] =>
  lines.map((l) => ({ productId: l.productId, color: l.color, quantity: l.quantity }))

// ─── Carrito ─────────────────────────────────────────────────────────────────

const CART_KEY = 'ml.cart.v1'
const WISH_KEY = 'ml.wishlist.v1'
const USER_KEY = 'ml.user.v1'

interface StoreContextValue {
  cart: CartItem[]
  cartTotals: CartTotals
  cartCount: number
  cartOpen: boolean
  setCartOpen: (open: boolean) => void
  addToCart: (product: Product, color: string, quantity?: number) => void
  updateQuantity: (productId: string, color: string, quantity: number) => void
  removeFromCart: (productId: string, color: string) => void
  clearCart: () => void
  wishlist: string[]
  toggleWishlist: (productId: string) => void
  isWishlisted: (productId: string) => boolean
  user: UserAccount | null
  login: (user: UserAccount) => void
  logout: () => void
}

const StoreContext = createContext<StoreContextValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>(() => load(CART_KEY, []))
  const [wishlist, setWishlist] = useState<string[]>(() =>
    load(WISH_KEY, []),
  )
  const [user, setUser] = useState<UserAccount | null>(() =>
    load<UserAccount | null>(USER_KEY, null),
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
  useEffect(() => {
    if (hydrated) save(USER_KEY, user)
  }, [user, hydrated])

  const cartTotals = useMemo<CartTotals>(() => {
    const lines = cart
      .map((item) => {
        const product = getProductById(item.productId)
        if (!product) return null
        return {
          product,
          color: item.color,
          quantity: item.quantity,
          lineTotal: product.price * item.quantity,
        }
      })
      .filter((l): l is NonNullable<typeof l> => l !== null)

    const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0)
    // Regla única de envío (domain/pricing vía data/shipping). En Fase 2 el
    // total pasará a ser autoritativo del servidor (quoteCart) y el cálculo
    // cliente desaparecerá por completo (defecto D5).
    const shipping = shippingCostFor('standard', subtotal)
    return {
      lines,
      subtotal,
      shipping,
      total: subtotal + shipping,
    }
  }, [cart])

  const addToCart = useCallback(
    (product: Product, color: string, quantity = 1) => {
      setCart((prev) =>
        toItems(
          cartReducer(toLines(prev), {
            type: 'add',
            productId: product.id,
            color,
            quantity,
          }),
        ),
      )
      setCartOpen(true)
    },
    [],
  )

  const updateQuantity = useCallback(
    (productId: string, color: string, quantity: number) => {
      setCart((prev) =>
        toItems(
          cartReducer(toLines(prev), {
            type: 'setQuantity',
            productId,
            color,
            quantity,
          }),
        ),
      )
    },
    [],
  )

  const removeFromCart = useCallback((productId: string, color: string) => {
    setCart((prev) =>
      toItems(cartReducer(toLines(prev), { type: 'remove', productId, color })),
    )
  }, [])

  const clearCart = useCallback(() => setCart([]), [])

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
      cartTotals,
      cartCount: cart.reduce((n, i) => n + i.quantity, 0),
      cartOpen,
      setCartOpen,
      addToCart,
      updateQuantity,
      removeFromCart,
      clearCart,
      wishlist,
      toggleWishlist,
      isWishlisted,
      user,
      login: (u) => setUser(u),
      logout: () => setUser(null),
    }),
    [
      cart,
      cartTotals,
      cartOpen,
      addToCart,
      updateQuantity,
      removeFromCart,
      clearCart,
      wishlist,
      toggleWishlist,
      isWishlisted,
      user,
    ],
  )

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  )
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore debe usarse dentro de <StoreProvider>')
  return ctx
}
