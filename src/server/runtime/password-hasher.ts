/**
 * Hasher de contraseñas en producción (plan 01 §9: sustituir el `devHash`
 * base64 de `src/server/session/store.ts`).
 *
 * - `scrypt` de `node:crypto` con **sal aleatoria por contraseña** y parámetros
 *   escritos dentro del propio hash (formato PHC-like, el mismo que usan las
 *   semillas, para que ambos interoperen).
 * - Verificación en **tiempo constante**: comparar con `===` filtra información
 *   por temporización.
 * - `verify` nunca lanza: un hash corrupto o ausente devuelve `false`.
 *
 * Nota de coste: `scrypt` con N=2^15 tarda decenas de milisegundos a propósito
 * (es lo que hace caro el ataque por diccionario).
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const SCRYPT = {
  n: 32_768,
  r: 8,
  p: 1,
  keyLength: 64,
  saltLength: 16,
  /** Límite explícito: con N=2^15 el cálculo necesita más memoria de la habitual. */
  maxmem: 64 * 1024 * 1024,
} as const

/** `$scrypt$N=…,r=…,p=…$<sal-b64url>$<clave-b64url>` */
export function hashPassword(password: string): string {
  if (password.length === 0) {
    throw new RangeError('La contraseña no puede estar vacía')
  }
  const salt = randomBytes(SCRYPT.saltLength)
  const key = scryptSync(password, salt, SCRYPT.keyLength, {
    N: SCRYPT.n,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: SCRYPT.maxmem,
  })
  return `$scrypt$N=${SCRYPT.n},r=${SCRYPT.r},p=${SCRYPT.p}$${salt.toString('base64url')}$${key.toString('base64url')}`
}

interface ScryptParams {
  n: number
  r: number
  p: number
}

function parseParams(labels: string): ScryptParams | null {
  const parsed: Record<string, number> = {}
  for (const pair of labels.split(',')) {
    const [key, raw] = pair.split('=')
    if (!key || raw === undefined) return null
    const value = Number(raw)
    if (!Number.isInteger(value) || value <= 0) return null
    parsed[key] = value
  }
  const { N, r, p } = parsed
  if (N === undefined || r === undefined || p === undefined) return null
  return { n: N, r, p }
}

/** Verificación en tiempo constante. Devuelve `false` ante cualquier hash inválido. */
export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false
  const parts = stored.split('$')
  // ['', 'scrypt', 'N=…,r=…,p=…', sal, clave]
  if (parts.length !== 5 || parts[1] !== 'scrypt') return false

  const params = parseParams(parts[2] ?? '')
  if (!params) return false

  let salt: Buffer
  let expected: Buffer
  try {
    salt = Buffer.from(parts[3] ?? '', 'base64url')
    expected = Buffer.from(parts[4] ?? '', 'base64url')
  } catch {
    return false
  }
  if (salt.length === 0 || expected.length === 0) return false

  let actual: Buffer
  try {
    actual = scryptSync(password, salt, expected.length, {
      N: params.n,
      r: params.r,
      p: params.p,
      maxmem: SCRYPT.maxmem,
    })
  } catch {
    // Parámetros absurdos (hash manipulado): no se filtra el motivo.
    return false
  }

  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

/** Puerto del hasher, para poder cambiar de algoritmo sin tocar a sus usuarios. */
export interface PasswordHasher {
  hash(password: string): Promise<string>
  verify(password: string, stored: string | null | undefined): Promise<boolean>
}

/** Adaptador por defecto: `scrypt` de Node. */
export function createScryptPasswordHasher(): PasswordHasher {
  return {
    hash: async (password) => hashPassword(password),
    verify: async (password, stored) => verifyPassword(password, stored),
  }
}
