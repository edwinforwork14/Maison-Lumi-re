import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { quoteCart, type CartQuote } from '@/features/commerce.api'
import { useStore } from '@/lib/store'
import type { ShippingMethodId } from '@/domain/pricing'

/**
 * Cotización del carrito servida por el servidor (defecto D5).
 *
 * El carrito local aporta **líneas**; los importes, la disponibilidad real de
 * cada SKU y el umbral de envío gratuito los aporta `quoteCart`. Ni el drawer
 * ni la página de carrito calculan nada: pintan esta respuesta.
 */
export interface CartQuoteState {
  quote: CartQuote | null
  /** Hay líneas y la cotización aún no ha llegado (≠ «carrito vacío»). */
  isLoading: boolean
  isError: boolean
  refetch: () => void
}

export function useCartQuote(shippingMethod?: ShippingMethodId): CartQuoteState {
  const { cart } = useStore()
  const lines = useMemo(
    () =>
      cart.map((l) => ({
        productId: l.productId,
        color: l.color,
        quantity: l.quantity,
      })),
    [cart],
  )

  const query = useQuery({
    queryKey: ['cart-quote', lines, shippingMethod ?? 'standard'],
    queryFn: () => quoteCart({ data: { lines, shippingMethod } }),
    enabled: lines.length > 0,
    staleTime: 30_000,
  })

  return {
    quote: query.data ?? null,
    isLoading: lines.length > 0 && query.isPending,
    isError: query.isError,
    refetch: () => {
      void query.refetch()
    },
  }
}
