import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { quoteCart, type CartQuote } from '@/features/commerce.api'
import { queryKeys } from '@/features/model/queries'
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

export function useCartQuote(
  shippingMethod?: ShippingMethodId,
  couponCode?: string,
): CartQuoteState {
  const { cart, reconcileCart } = useStore()
  const code = couponCode?.trim() ?? ''
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
    queryKey: queryKeys.cartQuote(lines, shippingMethod ?? 'standard', code),
    queryFn: () => quoteCart({ data: { lines, shippingMethod, couponCode: code || undefined } }),
    enabled: lines.length > 0,
    staleTime: 30_000,
    // Un código de cupón inválido no debe cachearse como si fuera la verdad.
    retry: false,
  })

  // Autocorrección: cuando el servidor responde, las líneas que ya no reconoce
  // (producto retirado o id de un catálogo anterior) se descartan del carrito
  // local, para que el contador deje de anunciar piezas incotizables.
  useEffect(() => {
    if (!query.isSuccess || !query.data) return
    const validKeys = new Set(
      query.data.lines.map((line) => `${line.productId}::${line.color}`),
    )
    reconcileCart(validKeys)
  }, [query.isSuccess, query.data, reconcileCart])

  return {
    quote: query.data ?? null,
    isLoading: lines.length > 0 && query.isPending,
    isError: query.isError,
    refetch: () => {
      void query.refetch()
    },
  }
}
