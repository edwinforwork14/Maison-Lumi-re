import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getProductBySlug, listCategories } from '@/features/commerce.api'
import { queryKeys } from '@/features/model/queries'
import { ProductDetailView } from '@/components/product/ProductDetailView'

/**
 * Quick view de producto (brief §1): al pulsar un producto, la ficha se
 * abre como **overlay** sobre la página actual —sin cambiar de ruta—, de
 * forma que al cerrar (Escape, botón «atrás» del navegador o la ✕) el
 * scroll y los filtros de la PLP están exactamente donde estaban (§2).
 *
 * La ruta `/products/$slug` NO desaparece: sigue existiendo para accesos
 * directos, refresh, SEO y enlaces compartidos. Es la navegación interna
 * (tarjetas, relacionados) la que pasa por el overlay.
 *
 * Integración con el historial (§4): al abrir se apila una entrada
 * (`pushState`) y se guarda el scroll de fondo; «atrás» y `popstate`
 * cierran el overlay y devuelven el scroll exactamente a donde estaba (las
 * entradas pushState no restauran scroll por sí solas).
 */

interface QuickViewContextValue {
  /** Abre el overlay con el producto del slug (sin cambiar la ruta). */
  openProduct: (slug: string) => void
  /** Cierra el overlay (idempotente). */
  close: () => void
  /** Slug abierto ahora mismo, o null. */
  activeSlug: string | null
}

const QuickViewContext = createContext<QuickViewContextValue | null>(null)

/** Marca de historial para distinguir nuestras entradas de las reales. */
const HISTORY_FLAG = 'ml-quick-view'

export function QuickViewProvider({ children }: { children?: ReactNode }) {
  const [activeSlug, setActiveSlug] = useState<string | null>(null)
  const queryClient = useQueryClient()
  /** Scroll de la página de fondo, guardado al abrir y devuelto al cerrar. */
  const scrollRef = useRef(0)

  /**
   * Cierre vía history cuando la entrada actual es la nuestra: dispara
   * `popstate`, que hace el `setState(null)` y restaura el scroll — un
   * único dueño del estado, sin rutas de cierre duplicadas (§18).
   */
  const close = useCallback(() => {
    if (history.state?.[HISTORY_FLAG]) {
      history.back()
    } else {
      setActiveSlug(null)
    }
  }, [])

  const openProduct = useCallback((slug: string) => {
    scrollRef.current = window.scrollY
    setActiveSlug(slug)
    if (!history.state?.[HISTORY_FLAG]) {
      history.pushState({ [HISTORY_FLAG]: true }, '')
    }
  }, [])

  // Botón atrás del navegador y `history.back()` de `close`: cierran el
  // overlay y restauran el scroll de la página de fondo (§2/§4).
  //
  // La restauración se reafirma durante ~2 s: el `scrollRestoration` de
  // TanStack Router re-aplica SU posición cacheada cuando el loader de la
  // ruta resuelve tras el `popstate` (puede ser varios cientos de ms
  // después) y pisaría un único `scrollTo`. Basta un solo frame coincidente
  // para parar; cualquier interacción del usuario (rueda, toque, tecla)
  // cancela el reafirmado para no secuestrar su scroll.
  useEffect(() => {
    const onPop = () => {
      setActiveSlug(null)
      const y = scrollRef.current
      const deadline = Date.now() + 2_000
      let matched = 0
      let cancelled = false
      const cancel = () => {
        cancelled = true
        for (const type of ['wheel', 'touchstart', 'keydown']) {
          window.removeEventListener(type, cancel)
        }
      }
      for (const type of ['wheel', 'touchstart', 'keydown']) {
        window.addEventListener(type, cancel, { passive: true, once: false })
      }
      const tick = () => {
        if (cancelled) return
        window.scrollTo(0, y)
        matched = Math.abs(window.scrollY - y) <= 1 ? matched + 1 : 0
        if (matched < 3 && Date.now() < deadline) {
          requestAnimationFrame(tick)
        } else {
          cancel()
        }
      }
      requestAnimationFrame(tick)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Escape cierra (§14/§15): el overlay no usa `useDialog` (la trampa de
  // foco rompería la interacción con el drawer del carrito que se abre
  // encima), así que escucha su propio Escape.
  useEffect(() => {
    if (activeSlug === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeSlug, close])

  // Bloqueo de scroll del body mientras el overlay está abierto: el fondo
  // no debe desplazarse jamás (§2: el scroll de la PLP se conserva, no se
  // pierde; el overlay tiene su propio scroll).
  useEffect(() => {
    if (activeSlug === null) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [activeSlug])

  // Datos del producto activo + categorías para las migas (React Query,
  // caché compartida con la PLP y la ruta: §16). Con `staleTime` de 5 min,
  // reabrir el mismo producto no dispara ninguna request.
  const { data: product, isPending, isError } = useQuery({
    queryKey: queryKeys.product(activeSlug ?? ''),
    queryFn: () => getProductBySlug({ data: { slug: activeSlug! } }),
    enabled: activeSlug !== null,
    staleTime: 5 * 60_000,
  })

  const { data: categories = [] } = useQuery({
    queryKey: queryKeys.categories(),
    queryFn: () => listCategories(),
    enabled: activeSlug !== null,
    staleTime: 5 * 60_000,
  })

  const value = useMemo<QuickViewContextValue>(
    () => ({ openProduct, close, activeSlug }),
    [openProduct, close, activeSlug],
  )

  return (
    <QuickViewContext.Provider value={value}>
      {children}

      {activeSlug !== null && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-surface animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-label={product ? product.name : 'Producto'}
        >
          {/* Barra opaca: la imagen no se transparenta nunca bajo la ✕. */}
          <div className="sticky top-0 z-20 flex min-h-14 items-center justify-between border-b border-line bg-surface px-5 py-2 md:px-10">
            <p className="body-strong">Producto</p>
            <button
              type="button"
              onClick={close}
              aria-label="Cerrar"
              className="grid size-10 place-items-center rounded-full text-strong transition-colors hover:bg-subtle"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden="true">
                <path d="M5 5l14 14" />
                <path d="M19 5 5 19" />
              </svg>
            </button>
          </div>

          {isError ? (
            <div className="mx-auto max-w-2xl px-4 py-32 text-center">
              <p className="mb-3 label-wide tracking-[0.3em] text-text-secondary">Error</p>
              <h2 className="mb-4 editorial-title">No hemos podido cargar la pieza</h2>
              <button type="button" onClick={() => void queryClient.invalidateQueries({ queryKey: queryKeys.product(activeSlug) })} className="btn btn-outline px-8 py-3">
                Reintentar
              </button>
            </div>
          ) : isPending || !product ? (
            <div className="mx-auto grid max-w-7xl gap-12 px-4 py-14 md:px-8 lg:grid-cols-2" aria-busy="true">
              <div className="skeleton aspect-3/4 w-full" />
              <div className="space-y-6">
                <div className="skeleton h-4 w-40" />
                <div className="skeleton h-10 w-72" />
                <div className="skeleton h-6 w-32" />
                <div className="skeleton h-24 w-full max-w-md" />
                <div className="skeleton h-14 w-full" />
              </div>
            </div>
          ) : (
            // Respiro bajo la barra: la galería no puede tocarla.
            <div className="pt-6 md:pt-10">
              <ProductDetailView
                product={product}
                categories={categories}
                onNavigate={close}
              />
            </div>
          )}
        </div>
      )}
    </QuickViewContext.Provider>
  )
}

export function useQuickView(): QuickViewContextValue {
  const ctx = useContext(QuickViewContext)
  if (!ctx) throw new Error('useQuickView debe usarse dentro de <QuickViewProvider>')
  return ctx
}
