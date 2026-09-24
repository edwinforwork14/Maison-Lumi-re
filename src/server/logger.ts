/**
 * Log estructurado (plan.md §4.10): nivel, evento, duración, códigos.
 * Sin PII ni datos de pago. En producción esto se envía al observabilidad.
 */

type Level = 'info' | 'warn' | 'error'

interface LogFields {
  readonly requestId?: string
  readonly route?: string
  readonly durationMs?: number
  readonly errorCode?: string
  readonly [key: string]: unknown
}

function emit(level: Level, event: string, fields: LogFields = {}): void {
  const entry = { ts: new Date().toISOString(), level, event, ...fields }
  const line = JSON.stringify(entry)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  info: (event: string, fields?: LogFields) => emit('info', event, fields),
  warn: (event: string, fields?: LogFields) => emit('warn', event, fields),
  error: (event: string, fields?: LogFields) => emit('error', event, fields),
}
