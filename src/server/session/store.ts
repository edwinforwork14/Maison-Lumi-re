/**
 * Sesión y cuentas en el servidor (plan.md §4.8, defecto D6).
 * La autoridad es el servidor: cookie firmada-en-serializada (fase in-memory)
 * httpOnly + sameSite; el usuario deja de vivir en localStorage.
 *
 * Nota honesta: el "hasher" es de desarrollo (base64); se documenta como tal
 * y el puerto queda listo para argon2/scrypt en Fase 5.
 */

import { getRequest, setCookie, getCookie } from '@tanstack/react-start/server'
import { AppError } from '../errors'

export interface SessionUser {
  readonly firstName: string
  readonly lastName: string
  readonly email: string
}

export interface CustomerRecord extends SessionUser {
  readonly passwordHash: string
}

const SESSION_COOKIE = 'ml.session'
const MAX_AGE = 60 * 60 * 24 * 7 // 7 días

// Cuentas in-memory (Fase 2; el puerto CustomerRepository permite migrar a DB)
const customers = new Map<string, CustomerRecord>()
customers.set('demo@maisonlumiere.es', {
  firstName: 'Demo',
  lastName: 'Maison',
  email: 'demo@maisonlumiere.es',
  passwordHash: devHash('demo1234'),
})

// hashes → usuarios autenticados en este proceso (in-memory)
const sessionsByToken = new Map<string, SessionUser>()

function devHash(password: string): string {
  return Buffer.from(`ml-dev:${password}`).toString('base64')
}

export function register(input: SessionUser & { password: string }): SessionUser {
  const email = input.email.trim().toLowerCase()
  if (customers.has(email)) {
    throw new AppError('CONFLICT', 'Ya existe una cuenta con este email')
  }
  const record: CustomerRecord = {
    firstName: input.firstName,
    lastName: input.lastName,
    email,
    passwordHash: devHash(input.password),
  }
  customers.set(email, record)
  return { firstName: record.firstName, lastName: record.lastName, email }
}

export function login(email: string, password: string): SessionUser {
  const record = customers.get(email.trim().toLowerCase())
  if (!record || record.passwordHash !== devHash(password)) {
    throw new AppError('UNAUTHENTICATED', 'Credenciales incorrectas')
  }
  return { firstName: record.firstName, lastName: record.lastName, email: record.email }
}

export function createSessionCookie(user: SessionUser): void {
  const token = crypto.randomUUID()
  sessionsByToken.set(token, user)
  // El token viaja en cookie httpOnly; el usuario nunca llega a localStorage.
  setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: MAX_AGE,
    path: '/',
  })
}

export function destroySession(): void {
  const token = getCookie(SESSION_COOKIE)
  if (token) sessionsByToken.delete(token)
  setCookie(SESSION_COOKIE, '', { httpOnly: true, maxAge: 0, path: '/' })
}

export function getSessionUser(): SessionUser | null {
  const token = getCookie(SESSION_COOKIE)
  if (!token) return null
  return sessionsByToken.get(token) ?? null
}

/** Para el guard de rutas: sesión resuelta en servidor. */
export function requireSessionUser(): SessionUser {
  const user = getSessionUser()
  if (!user) throw new AppError('UNAUTHENTICATED', 'Sesión requerida')
  return user
}

/** Referencia al Request actual, útil para trazas (requestId). */
export function currentRequest(): Request {
  return getRequest()
}
