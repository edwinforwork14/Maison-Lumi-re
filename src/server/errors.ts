/**
 * Errores de aplicación (plan.md §4.9).
 * Los fallos esperados viajan como AppError con código; los de programación
 * se normalizan a INTERNAL sin exponer detalles internos al cliente.
 */

export type ErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'OUT_OF_STOCK'
  | 'PAYMENT_DECLINED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'CONFIG'
  | 'INTERNAL'

export class AppError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}
