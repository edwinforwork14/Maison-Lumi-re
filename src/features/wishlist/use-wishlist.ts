import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSession, listWishlist, toggleWishlist } from '@/features/commerce.api'
import { queryKeys } from '@/features/model/queries'
import { useStore } from '@/lib/store'

/**
 * Wishlist (Plan 03, S3 y D38).
 *
 * - **Autenticado:** la verdad vive en el servidor (`listWishlist` /
 *   `toggleWishlist`), así que la lista le sigue a otro dispositivo. El cambio
 *   es optimista: se pinta al instante y se revierte si el servidor falla.
 * - **Anónimo:** sólo queda el almacenamiento local, que actúa como caché
 *   mientras la sesión se resuelve. La identidad nunca se guarda aquí.
 *
 * `isPending` distingue «todavía no sabemos si hay sesión» de «no hay nada»:
 * la página de wishlist no puede pintar un vacío durante la carga (D35).
 */
export interface WishlistState {
  readonly ids: readonly string[]
  /** La sesión o la lista siguen resolviéndose: aún no hay veredicto. */
  readonly isPending: boolean
  /** `null` mientras la sesión no se ha resuelto. */
  readonly isAuthenticated: boolean | null
  readonly toggle: (productId: string) => void
  readonly isWishlisted: (productId: string) => boolean
}

export function useWishlist(): WishlistState {
  const queryClient = useQueryClient()
  const store = useStore()

  const session = useQuery({
    queryKey: queryKeys.session(),
    queryFn: () => getSession(),
    staleTime: 60_000,
    retry: false,
  })
  const authenticated = session.data ? Boolean(session.data.user) : null

  const server = useQuery({
    queryKey: queryKeys.wishlist(),
    queryFn: () => listWishlist(),
    enabled: authenticated === true,
    staleTime: 30_000,
  })

  const toggleMutation = useMutation({
    mutationFn: (productId: string) => toggleWishlist({ data: { productId } }),
    onMutate: async (productId) => {
      const key = queryKeys.wishlist()
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<string[]>(key)
      queryClient.setQueryData<string[]>(key, (current = []) =>
        current.includes(productId)
          ? current.filter((id) => id !== productId)
          : [...current, productId],
      )
      return { previous }
    },
    onError: (_error, _productId, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.wishlist(), context.previous)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.wishlist() })
    },
  })

  const toggle = useCallback(
    (productId: string) => {
      if (authenticated === true) {
        toggleMutation.mutate(productId)
        return
      }
      // Anónimo o sesión aún sin resolver: caché local optimista.
      store.toggleWishlist(productId)
    },
    [authenticated, store, toggleMutation],
  )

  const ids = authenticated === true ? (server.data ?? []) : store.wishlist

  return {
    ids,
    isPending:
      session.isPending || (authenticated === true && server.isPending && !server.data),
    isAuthenticated: authenticated,
    toggle,
    isWishlisted: (productId: string) => ids.includes(productId),
  }
}
