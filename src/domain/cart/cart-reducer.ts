/**
 * Reducer puro del carrito (plan.md Fase 1, domain/cart).
 * Sin React, sin persistencia: solo transformaciones de estado testeables.
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

/** Totales de línea puros; el precio lo aporta el llamador (servidor/semillas). */
export function cartLineTotals<E extends { id: string }>(
  state: readonly CartLine[],
  findEntity: (productId: string) => E | undefined,
  unitPrice: (entity: E) => number,
): Array<{ line: CartLine; entity: E; lineTotal: number }> {
  const result: Array<{ line: CartLine; entity: E; lineTotal: number }> = []
  for (const line of state) {
    const entity = findEntity(line.productId)
    if (!entity) continue // producto retirado: la línea se ignora, no rompe
    result.push({ line, entity, lineTotal: unitPrice(entity) * line.quantity })
  }
  return result
}

export function cartSubtotal(
  state: readonly CartLine[],
  findEntity: (productId: string) => { id: string; price: number } | undefined,
): number {
  return cartLineTotals(state, findEntity, (e) => e.price).reduce(
    (sum, l) => sum + l.lineTotal,
    0,
  )
}
