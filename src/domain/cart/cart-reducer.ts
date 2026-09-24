/**
 * Reducer puro del carrito (plan.md Fase 1, domain/cart).
 * Sin React, sin persistencia: solo transformaciones de estado testeables.
 *
 * El carrito guarda **líneas**, nunca importes: los precios, el subtotal y el
 * total son competencia exclusiva del servidor (`quoteCart`). Aquí no hay
 * ninguna aritmética de dinero (defecto D5: una sola verdad del total).
 */

export interface CartLine {
  readonly productId: string
  readonly color: string
  readonly quantity: number
}

export type CartAction =
  | { type: 'add'; productId: string; color: string; quantity?: number }
  | { type: 'setQuantity'; productId: string; color: string; quantity: number }
  | { type: 'remove'; productId: string; color: string }
  | { type: 'clear' }

export function cartReducer(state: readonly CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case 'add': {
      const qty = Math.max(1, action.quantity ?? 1)
      const idx = state.findIndex(
        (l) => l.productId === action.productId && l.color === action.color,
      )
      if (idx >= 0) {
        return state.map((l, i) =>
          i === idx ? { ...l, quantity: l.quantity + qty } : l,
        )
      }
      return [...state, { productId: action.productId, color: action.color, quantity: qty }]
    }
    case 'setQuantity': {
      if (action.quantity <= 0) {
        return state.filter(
          (l) => !(l.productId === action.productId && l.color === action.color),
        )
      }
      return state.map((l) =>
        l.productId === action.productId && l.color === action.color
          ? { ...l, quantity: action.quantity }
          : l,
      )
    }
    case 'remove':
      return state.filter(
        (l) => !(l.productId === action.productId && l.color === action.color),
      )
    case 'clear':
      return []
  }
}

export function cartCount(state: readonly CartLine[]): number {
  return state.reduce((n, l) => n + l.quantity, 0)
}

/**
 * Tope de cantidad disponible (defecto D18): el máximo nunca puede superar el
 * stock real del SKU que devuelve el servidor. El tope de la UI es una ayuda;
 * la validación que manda es la de `placeOrder`.
 */
export function clampQuantity(quantity: number, availableStock: number): number {
  return Math.max(0, Math.min(Math.trunc(quantity), Math.max(0, availableStock)))
}

/** Cantidad inicial razonable para un alta: 1 unidad, 0 si está agotado. */
export function initialQuantity(availableStock: number): number {
  return availableStock > 0 ? 1 : 0
}
