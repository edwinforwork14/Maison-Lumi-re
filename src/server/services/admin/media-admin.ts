/**
 * Media de producto (Plan 02 §4: `adminCreateUploadUrl`, `adminAttachMedia`,
 * `adminReorderMedia`).
 *
 * Por qué URL pre-firmada y no un `POST` con el binario dentro: la server
 * function transporta JSON, y meter ahí imágenes multiplicaría la memoria del
 * proceso y rompería el límite de tamaño del body. El flujo es el de siempre:
 * el panel pide una URL firmada, el navegador sube directo al almacén y sólo
 * después se crea la fila en `product_media`.
 *
 * **Almacén pendiente.** Todavía no hay proveedor de objetos decidido, así que
 * la firma se hace aquí con HMAC sobre `storageKey|exp` usando `SESSION_SECRET`:
 * es el contrato que debe verificar quien reciba la subida. Sin
 * `MEDIA_UPLOAD_BASE_URL`, la operación lanza `CONFIG` con la instrucción en vez
 * de devolver una URL que no subiría nada. Mientras tanto, el alta manual por
 * URL (`adminAttachMedia` con una URL completa) sí funciona: es el modelo con el
 * que vive hoy la semilla (`storage_key` guarda la URL entera).
 */

import { and, asc, eq, gt, sql } from 'drizzle-orm'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { getDb, type Database } from '../../db/client.ts'
import { productMedia } from '../../db/schema/catalog.ts'
import { createPostgresAuditRepository } from '../../db/repositories/audit.postgres.ts'
import { AppError } from '../../errors.ts'
import { assertPermission, type AdminActor } from './actor.ts'
import { PERMISSIONS } from './permissions.ts'

/** Tamaño máximo de un archivo de imagen (8 MB). */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

/** Caducidad de una URL pre-firmada: 10 minutos. */
export const UPLOAD_URL_TTL_SECONDS = 10 * 60

const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const

export function isAllowedContentType(contentType: string): boolean {
  return (ALLOWED_CONTENT_TYPES as readonly string[]).includes(contentType)
}

/** Nombre de fichero saneado: sin rutas, sin caracteres raros, con extensión. */
export function sanitizeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? 'imagen'
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, '-').replace(/-+/g, '-').slice(-80)
  return cleaned.includes('.') ? cleaned : `${cleaned}.img`
}

function signature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function signUpload(storageKey: string, expiresAt: number, secret: string): string {
  return signature(`${storageKey}|${expiresAt}`, secret)
}

/** ¿Firma válida y no caducada? Comparación en tiempo constante. */
export function verifyUploadSignature(
  storageKey: string,
  expiresAt: number,
  provided: string,
  secret: string,
  now = Date.now(),
): boolean {
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 < now) return false
  const expected = signUpload(storageKey, expiresAt, secret)
  const a = Buffer.from(expected)
  const b = Buffer.from(provided)
  return a.length === b.length && timingSafeEqual(a, b)
}

export interface UploadTicket {
  readonly uploadUrl: string
  readonly method: 'PUT'
  readonly storageKey: string
  readonly headers: Record<string, string>
  readonly expiresAt: string
}

/**
 * Pide una URL pre-firmada para subir una imagen. El binario nunca pasa por
 * esta función: sólo se devuelve el ticket.
 */
export async function createAdminUploadUrl(
  actor: AdminActor | null,
  input: { filename: string; contentType: string; sizeBytes: number },
  secret: string | undefined = process.env.SESSION_SECRET,
  baseUrl: string | undefined = process.env.MEDIA_UPLOAD_BASE_URL,
): Promise<UploadTicket> {
  assertPermission(actor, PERMISSIONS.productsWrite)

  if (!isAllowedContentType(input.contentType)) {
    throw new AppError(
      'VALIDATION',
      `Tipo de imagen no admitido: ${input.contentType}. Admitidos: ${ALLOWED_CONTENT_TYPES.join(', ')}`,
    )
  }
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new AppError('VALIDATION', 'El tamaño del archivo debe ser un entero positivo')
  }
  if (input.sizeBytes > MAX_UPLOAD_BYTES) {
    throw new AppError('VALIDATION', `La imagen supera el máximo de ${MAX_UPLOAD_BYTES} bytes`)
  }
  if (!baseUrl) {
    throw new AppError(
      'CONFIG',
      'Falta MEDIA_UPLOAD_BASE_URL: configura el almacén de objetos (S3, R2, CDN…) para subir imágenes. Mientras tanto, adjunta la imagen por URL con adminAttachMedia.',
    )
  }
  if (!secret || secret.length < 32) {
    throw new AppError('CONFIG', 'SESSION_SECRET (mínimo 32 caracteres) es obligatorio para firmar subidas')
  }

  const storageKey = `products/${Date.now().toString(36)}-${sanitizeFilename(input.filename)}`
  const expires = Math.floor(Date.now() / 1000) + UPLOAD_URL_TTL_SECONDS
  const sig = signUpload(storageKey, expires, secret)

  return {
    uploadUrl: `${baseUrl.replace(/\/$/, '')}/${storageKey}?exp=${expires}&sig=${sig}`,
    method: 'PUT',
    storageKey,
    headers: { 'content-type': input.contentType, 'x-upload-exp': String(expires), 'x-upload-sig': sig },
    expiresAt: new Date(expires * 1000).toISOString(),
  }
}

export interface MediaInput {
  readonly productId: string
  readonly variantId?: string | null
  /** URL completa o clave opaca del almacén (es lo que guarda `storage_key`). */
  readonly storageKey: string
  readonly alt: string
  readonly width?: number
  readonly height?: number
  readonly position?: number
}

/** Adjunta una imagen a un producto y lo deja auditado. */
export async function attachAdminMedia(
  actor: AdminActor | null,
  input: MediaInput,
  db: Database = getDb(),
): Promise<{ id: string }> {
  assertPermission(actor, PERMISSIONS.productsWrite)
  const alt = input.alt.trim()
  if (!alt) throw new AppError('VALIDATION', 'La imagen necesita texto alternativo (alt)')
  const storageKey = input.storageKey.trim()
  if (!storageKey) throw new AppError('VALIDATION', 'La imagen necesita una URL o clave de almacenamiento')

  const audit = createPostgresAuditRepository(db)

  return db.transaction(async (tx) => {
    const duplicate = await tx
      .select({ id: productMedia.id })
      .from(productMedia)
      .where(eq(productMedia.storageKey, storageKey))
      .limit(1)
    if (duplicate.length > 0) {
      throw new AppError('CONFLICT', 'Esa imagen ya está asociada a un producto')
    }

    const [next] = await tx
      .select({ position: sql<number>`coalesce(max(${productMedia.position}), -1)::int` })
      .from(productMedia)
      .where(eq(productMedia.productId, input.productId))

    const [created] = await tx
      .insert(productMedia)
      .values({
        productId: input.productId,
        variantId: input.variantId ?? null,
        storageKey,
        alt,
        width: input.width ?? 900,
        height: input.height ?? 1200,
        type: 'image',
        position: input.position ?? Number(next?.position ?? -1) + 1,
      })
      .returning({ id: productMedia.id })

    await audit.record({
      actorId: actor!.userId,
      actorKind: 'user',
      action: 'media.attach',
      entity: 'product_media',
      entityId: created!.id,
      before: null,
      after: { productId: input.productId, alt, storageKey },
    })
    return { id: created!.id }
  })
}

/** Reordena las imágenes de un producto en una sola transacción. */
export async function reorderAdminMedia(
  actor: AdminActor | null,
  input: { productId: string; ids: readonly string[] },
  db: Database = getDb(),
): Promise<{ updated: number }> {
  assertPermission(actor, PERMISSIONS.productsWrite)
  const ids = [...new Set(input.ids)]
  if (ids.length === 0) throw new AppError('VALIDATION', 'El orden no puede estar vacío')
  const audit = createPostgresAuditRepository(db)

  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: productMedia.id })
      .from(productMedia)
      .where(and(eq(productMedia.productId, input.productId)))
      .orderBy(asc(productMedia.position))
    const owned = new Set(existing.map((row) => row.id))
    // Ninguna imagen ajena puede colarse en el orden de otro producto.
    if (ids.some((id) => !owned.has(id))) {
      throw new AppError('CONFLICT', 'El orden contiene imágenes que no pertenecen a este producto')
    }

    for (const [index, id] of ids.entries()) {
      await tx
        .update(productMedia)
        .set({ position: index, updatedAt: new Date() })
        .where(eq(productMedia.id, id))
    }

    await audit.record({
      actorId: actor!.userId,
      actorKind: 'user',
      action: 'media.reorder',
      entity: 'product_media',
      entityId: input.productId,
      before: null,
      after: { order: ids },
    })
    return { updated: ids.length }
  })
}

/** Lista las imágenes de un producto (para la ficha del panel). */
export async function listAdminMedia(
  actor: AdminActor | null,
  productId: string,
  db: Database = getDb(),
): Promise<Array<{ id: string; storageKey: string; alt: string; position: number; width: number; height: number }>> {
  assertPermission(actor, PERMISSIONS.productsRead)
  const rows = await db
    .select({
      id: productMedia.id,
      storageKey: productMedia.storageKey,
      alt: productMedia.alt,
      position: productMedia.position,
      width: productMedia.width,
      height: productMedia.height,
    })
    .from(productMedia)
    .where(and(eq(productMedia.productId, productId), gt(productMedia.position, -1)))
    .orderBy(asc(productMedia.position))
  return rows
}
