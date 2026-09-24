/**
 * Contrato de paginación por cursor (plan 01, F4: «contrato de cursor probado»).
 *
 * Por qué cursor y no `offset`: con `offset`, una fila insertada mientras el
 * usuario pagina desplaza la ventana y hace que vea un registro repetido o se
 * salte uno. El cursor apunta a la última fila vista, así que la página
 * siguiente es estable aunque el catálogo cambie.
 *
 * El cursor es **opaco y validado**: viaja en base64url, se decodifica con Zod
 * y, si está manipulado o corrupto, se ignora (`null`) en lugar de romper.
 */

import { z } from 'zod'

const cursorSchema = z.object({
  /** Clave de orden de la última fila devuelta (ISO date o valor comparable). */
  k: z.string().min(1),
  /** Desempate estable cuando la clave de orden se repite. */
  id: z.string().min(1),
})

export type Cursor = z.infer<typeof cursorSchema>

export interface Page<T> {
  readonly items: readonly T[]
  readonly nextCursor: string | null
  readonly hasMore: boolean
}

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

/** Normaliza el tamaño de página pedido por el cliente (nunca confiar en él). */
export function clampPageSize(requested?: number, fallback = DEFAULT_PAGE_SIZE): number {
  if (requested === undefined || !Number.isFinite(requested)) return fallback
  const integer = Math.trunc(requested)
  if (integer <= 0) return fallback
  return Math.min(integer, MAX_PAGE_SIZE)
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

/** Devuelve `null` ante cualquier cursor inválido: se empieza por el principio. */
export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw) return null
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/**
 * Recorta una lista ya ordenada al tamaño de página y calcula el cursor de
 * continuación. Se pide `size + 1` filas a la base para saber si hay más sin
 * hacer una consulta de conteo extra.
 */
export function paginate<T>(
  rows: readonly T[],
  size: number,
  keyOf: (row: T) => string,
  idOf: (row: T) => string,
): Page<T> {
  const limit = clampPageSize(size)
  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : [...rows]
  const last = items.at(-1)
  return {
    items,
    hasMore,
    nextCursor: hasMore && last ? encodeCursor({ k: keyOf(last), id: idOf(last) }) : null,
  }
}
