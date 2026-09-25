import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '../../src/server/db/schema/index.ts'
import { hashPassword } from '../../src/server/runtime/password-hasher.ts'
import { seedRbac, assignRoleToUser } from '../../src/server/db/seed/rbac.ts'
import { createPostgresSessionsRepository } from '../../src/server/db/repositories/sessions.postgres.ts'
import { resolveAdminActor } from '../../src/server/services/admin/actor.ts'
import { createPostgresAuditRepository } from '../../src/server/db/repositories/audit.postgres.ts'
import { ALL_PERMISSIONS, type RoleKey } from '../../src/server/services/admin/permissions.ts'
import {
  assertCouponValueMatchesKind,
  listAdminCoupons,
  listAdminReviews,
  moderateAdminReview,
  normalizeCouponCode,
  setAdminCouponStatus,
  upsertAdminCoupon,
} from '../../src/server/services/admin/promotions-admin.ts'
import {
  attachAdminMedia,
  createAdminUploadUrl,
  listAdminMedia,
  reorderAdminMedia,
  signUpload,
  verifyUploadSignature,
} from '../../src/server/services/admin/media-admin.ts'

/**
 * Plan 02, §11: cada mutación deja efecto en la base **y** fila de auditoría;
 * los duplicados y las violaciones de regla salen como `CONFLICT`/`VALIDATION`;
 * cada server function tiene detrás un permiso que se puede denegar.
 */

const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL
if (!url) console.warn('[tests/db/promotions-admin] DATABASE_URL no definida: suite omitida.')
const suite = url ? describe : describe.skip

if (url) {
  const client = postgres(url, { max: 5, onnotice: () => {} })
  const db = drizzle(client, { schema })
  const SECRET = 'secreto-de-pruebas-promociones-con-mas-de-32-caracteres'

  after(async () => {
    await client.end({ timeout: 5 })
  })
  before(async () => {
    await seedRbac(db)
  })

  const token = () => Math.random().toString(36).slice(2, 10)

  async function actorWithRole(role: RoleKey) {
    const t = token()
    const [user] = await client<{ id: string }[]>`
      INSERT INTO users (email, password_hash)
      VALUES (${`promo-${role}-${t}@example.com`}, ${hashPassword('Promo-Pass-1234')}) RETURNING id`
    await assignRoleToUser({ userId: user!.id, roleKey: role }, db)
    const sessions = createPostgresSessionsRepository(db, SECRET)
    const issued = await sessions.issue({ userId: user!.id, kind: 'admin' })
    return { actor: await resolveAdminActor(issued.cookieValue, db, SECRET), userId: user!.id }
  }

  /** Producto + variante + pedido con una línea (para poder reseñar). */
  async function seedReviewableOrder() {
    const t = token()
    const [category] = await client<{ id: string }[]>`
      INSERT INTO categories (slug, name) VALUES (${`cat-${t}`}, 'Cat') RETURNING id`
    const [product] = await client<{ id: string }[]>`
      INSERT INTO products (slug, name, category_id) VALUES (${`p-${t}`}, 'Producto', ${category!.id}) RETURNING id`
    const [variant] = await client<{ id: string }[]>`
      INSERT INTO product_variants (product_id, sku, size, color, price_cents)
      VALUES (${product!.id}, ${`SKU-${t}`}, 'Única', 'Negro', 10000) RETURNING id`
    const [order] = await client<{ id: string }[]>`
      INSERT INTO orders (number, email, status, subtotal_cents, total_cents, placed_at)
      VALUES (${`ML-REV-${t}`}, ${`rev-${t}@example.com`}, 'fulfilled', 10000, 10000, now())
      RETURNING id`
    const [item] = await client<{ id: string }[]>`
      INSERT INTO order_items (order_id, variant_id, sku_snapshot, name_snapshot,
                               unit_price_cents, quantity, line_total_cents)
      VALUES (${order!.id}, ${variant!.id}, ${`SKU-${t}`}, 'Producto', 10000, 1, 10000)
      RETURNING id`
    const [review] = await client<{ id: string }[]>`
      INSERT INTO reviews (product_id, order_item_id, rating, title, body, status)
      VALUES (${product!.id}, ${item!.id}, 5, 'Excelente', 'Muy cómodas', 'pending')
      RETURNING id`
    return { productId: product!.id, reviewId: review!.id }
  }

  suite('cupones: validación por tipo, unicidad y auditoría', () => {
    it('valida el valor según el tipo antes de tocar la base', () => {
      assert.doesNotThrow(() => assertCouponValueMatchesKind('percent', 50))
      assert.doesNotThrow(() => assertCouponValueMatchesKind('fixed', 500))
      assert.doesNotThrow(() => assertCouponValueMatchesKind('free_shipping', 0))
      assert.throws(() => assertCouponValueMatchesKind('percent', 150), /entre 1 y 100/)
      assert.throws(() => assertCouponValueMatchesKind('fixed', 0), /mayor que cero/)
      assert.throws(() => assertCouponValueMatchesKind('free_shipping', 100), /no lleva valor/)
    })

    it('normaliza el código a mayúsculas (la identidad del cupón)', () => {
      assert.equal(normalizeCouponCode('  verano26 '), 'VERANO26')
    })

    it('crea, lista y edita un cupón dejando auditoría', async () => {
      const { actor } = await actorWithRole('manager')
      const code = `TST${token().toUpperCase()}`
      const created = await upsertAdminCoupon(
        actor,
        { code: code.toLowerCase(), kind: 'percent', value: 15, maxUses: 10 },
        db,
      )
      assert.equal(created.created, true)

      const page = await listAdminCoupons(actor, { q: code }, db)
      const row = page.items.find((coupon) => coupon.code === code)
      assert.ok(row, 'el cupón creado debe aparecer en el listado')
      assert.equal(row.kind, 'percent')
      assert.equal(row.value, 15)

      await setAdminCouponStatus(actor, { id: row.id, status: 'paused' }, db)
      const audit = createPostgresAuditRepository(db)
      const entries = await audit.listByEntity('coupons', row.id)
      assert.equal(entries.length, 2)
      assert.ok(entries.some((entry) => entry.action === 'coupon.create'))
      assert.ok(entries.some((entry) => entry.action === 'coupon.status'))
    })

    it('un código repetido sale como CONFLICT, no como violación de índice', async () => {
      const { actor } = await actorWithRole('manager')
      const code = `DUP${token().toUpperCase()}`
      await upsertAdminCoupon(actor, { code, kind: 'fixed', value: 500 }, db)
      await assert.rejects(
        upsertAdminCoupon(actor, { code, kind: 'fixed', value: 700 }, db),
        (error: unknown) => (error as { code?: string }).code === 'CONFLICT',
      )
    })

    it('una vigencia invertida se rechaza con VALIDATION', async () => {
      const { actor } = await actorWithRole('manager')
      await assert.rejects(
        upsertAdminCoupon(
          actor,
          {
            code: `WIN${token().toUpperCase()}`,
            kind: 'percent',
            value: 10,
            startsAt: new Date('2026-06-01T00:00:00Z'),
            endsAt: new Date('2026-01-01T00:00:00Z'),
          },
          db,
        ),
        (error: unknown) => (error as { code?: string }).code === 'VALIDATION',
      )
    })

    it('la matriz de permisos se aplica: manager sí, editor y support no', async () => {
      const { actor: manager } = await actorWithRole('manager')
      const { actor: editor } = await actorWithRole('editor')
      const { actor: support } = await actorWithRole('support')

      const code = `PERM${token().toUpperCase()}`
      await assert.doesNotReject(
        upsertAdminCoupon(manager, { code, kind: 'percent', value: 5 }, db),
      )
      await assert.rejects(
        upsertAdminCoupon(editor, { code: `E${token()}`, kind: 'percent', value: 5 }, db),
        (error: unknown) => (error as { code?: string }).code === 'FORBIDDEN',
      )
      await assert.rejects(
        listAdminCoupons(support, {}, db),
        (error: unknown) => (error as { code?: string }).code === 'FORBIDDEN',
      )
      await assert.rejects(
        upsertAdminCoupon(null, { code: `N${token()}`, kind: 'percent', value: 5 }, db),
        (error: unknown) => (error as { code?: string }).code === 'UNAUTHENTICATED',
      )
    })
  })

  suite('reseñas: sólo la moderación publica, y queda auditada', () => {
    it('aprobar una reseña cambia el estado, marca al moderador y audita', async () => {
      const { actor, userId } = await actorWithRole('support')
      const { reviewId } = await seedReviewableOrder()

      const result = await moderateAdminReview(
        actor,
        { id: reviewId, status: 'approved', note: 'Compra verificada' },
        db,
      )
      assert.equal(result.status, 'approved')

      const [row] = await client<{ status: string; moderated_by: string | null }[]>`
        SELECT status, moderated_by FROM reviews WHERE id = ${reviewId}`
      assert.equal(row!.status, 'approved')
      assert.equal(row!.moderated_by, userId)

      const audit = createPostgresAuditRepository(db)
      const entries = await audit.listByEntity('reviews', reviewId)
      assert.equal(entries.length, 1)
      assert.equal(entries[0]!.action, 'review.moderate')
    })

    it('una reseña inexistente es NOT_FOUND y un rol sin permiso es FORBIDDEN', async () => {
      const { actor: support } = await actorWithRole('support')
      const { actor: editor } = await actorWithRole('editor')

      await assert.rejects(
        moderateAdminReview(support, { id: '00000000-0000-4000-8000-000000000000', status: 'rejected' }, db),
        (error: unknown) => (error as { code?: string }).code === 'NOT_FOUND',
      )
      await assert.rejects(
        listAdminReviews(editor, {}, db),
        (error: unknown) => (error as { code?: string }).code === 'FORBIDDEN',
      )
    })
  })

  suite('media: adjuntar, reordenar y pedir URL pre-firmada', () => {
    /** Categoría + producto propios, para no tocar los sembrados. */
    async function seedProduct() {
      const t = token()
      const [category] = await client<{ id: string }[]>`
        INSERT INTO categories (slug, name) VALUES (${`mcat-${t}`}, 'Cat') RETURNING id`
      const [product] = await client<{ id: string }[]>`
        INSERT INTO products (slug, name, category_id) VALUES (${`m-${t}`}, 'Producto', ${category!.id})
        RETURNING id`
      return { productId: product!.id }
    }

    it('adjunta una imagen, la lista y lo deja auditado', async () => {
      const { actor } = await actorWithRole('editor')
      const { productId } = await seedProduct()
      const storageKey = `https://cdn.example.com/${token()}.jpg`

      const created = await attachAdminMedia(
        actor,
        { productId, storageKey, alt: 'Vista frontal' },
        db,
      )
      const rows = await listAdminMedia(actor, productId, db)
      assert.equal(rows.length, 1)
      assert.equal(rows[0]!.id, created.id)

      const audit = createPostgresAuditRepository(db)
      const entries = await audit.listByEntity('product_media', created.id)
      assert.equal(entries[0]!.action, 'media.attach')
    })

    it('una imagen repetida sale como CONFLICT y el alt vacío como VALIDATION', async () => {
      const { actor } = await actorWithRole('editor')
      const { productId } = await seedProduct()
      const storageKey = `https://cdn.example.com/${token()}.jpg`

      await attachAdminMedia(actor, { productId, storageKey, alt: 'Primera' }, db)
      await assert.rejects(
        attachAdminMedia(actor, { productId, storageKey, alt: 'Segunda' }, db),
        (error: unknown) => (error as { code?: string }).code === 'CONFLICT',
      )
      await assert.rejects(
        attachAdminMedia(actor, { productId, storageKey: `https://cdn.example.com/${token()}.jpg`, alt: '  ' }, db),
        (error: unknown) => (error as { code?: string }).code === 'VALIDATION',
      )
    })

    it('reordena dentro del producto y rechaza imágenes ajenas', async () => {
      const { actor } = await actorWithRole('editor')
      const { productId } = await seedProduct()
      const { productId: otherId } = await seedProduct()

      const first = await attachAdminMedia(
        actor,
        { productId, storageKey: `https://cdn.example.com/${token()}-1.jpg`, alt: 'Una' },
        db,
      )
      const second = await attachAdminMedia(
        actor,
        { productId, storageKey: `https://cdn.example.com/${token()}-2.jpg`, alt: 'Dos' },
        db,
      )
      const foreign = await attachAdminMedia(
        actor,
        { productId: otherId, storageKey: `https://cdn.example.com/${token()}-3.jpg`, alt: 'Ajena' },
        db,
      )

      const result = await reorderAdminMedia(actor, { productId, ids: [second.id, first.id] }, db)
      assert.equal(result.updated, 2)

      const rows = await listAdminMedia(actor, productId, db)
      assert.deepEqual(
        rows.map((row) => row.id),
        [second.id, first.id],
      )

      await assert.rejects(
        reorderAdminMedia(actor, { productId, ids: [foreign.id] }, db),
        (error: unknown) => (error as { code?: string }).code === 'CONFLICT',
      )
    })

    it('sin almacén configurado la subida lanza CONFIG; con él, la URL firma y verifica', async () => {
      const { actor } = await actorWithRole('editor')

      await assert.rejects(
        createAdminUploadUrl(
          actor,
          { filename: 'foto.jpg', contentType: 'image/jpeg', sizeBytes: 1024 },
          SECRET,
          undefined,
        ),
        (error: unknown) => (error as { code?: string }).code === 'CONFIG',
      )

      await assert.rejects(
        createAdminUploadUrl(
          actor,
          { filename: 'foto.exe', contentType: 'application/x-msdownload', sizeBytes: 1024 },
          SECRET,
          'https://cdn.example.com/upload',
        ),
        (error: unknown) => (error as { code?: string }).code === 'VALIDATION',
      )

      const ticket = await createAdminUploadUrl(
        actor,
        { filename: 'foto.jpg', contentType: 'image/jpeg', sizeBytes: 1024 },
        SECRET,
        'https://cdn.example.com/upload',
      )
      assert.equal(ticket.method, 'PUT')
      assert.ok(ticket.uploadUrl.startsWith('https://cdn.example.com/upload/products/'))
      const exp = Number(new URL(ticket.uploadUrl).searchParams.get('exp'))
      const sig = new URL(ticket.uploadUrl).searchParams.get('sig')!
      assert.equal(verifyUploadSignature(ticket.storageKey, exp, sig, SECRET), true)
      assert.equal(verifyUploadSignature(ticket.storageKey, exp, `${sig}x`, SECRET), false)
      assert.equal(verifyUploadSignature(ticket.storageKey, exp, signUpload('otra-clave', exp, SECRET), SECRET), false)
      // Caducado: la misma firma deja de servir.
      assert.equal(verifyUploadSignature(ticket.storageKey, exp, sig, SECRET, Date.now() + 11 * 60_000), false)
    })
  })

  suite('autorización: ninguna función admin se escapa del permiso', () => {
    it('sin sesión, todo lanza UNAUTHENTICATED', async () => {
      await assert.rejects(
        listAdminCoupons(null, {}, db),
        (error: unknown) => (error as { code?: string }).code === 'UNAUTHENTICATED',
      )
      await assert.rejects(
        listAdminReviews(null, {}, db),
        (error: unknown) => (error as { code?: string }).code === 'UNAUTHENTICATED',
      )
      await assert.rejects(
        attachAdminMedia(null, { productId: 'x', storageKey: 'y', alt: 'z' }, db),
        (error: unknown) => (error as { code?: string }).code === 'UNAUTHENTICATED',
      )
    })

    it('todos los permisos declarados siguen siendo los del plan', () => {
      assert.ok(ALL_PERMISSIONS.includes('coupons:write'))
      assert.ok(ALL_PERMISSIONS.includes('coupons:read'))
      assert.ok(ALL_PERMISSIONS.includes('reviews:moderate'))
      assert.equal(new Set(ALL_PERMISSIONS).size, ALL_PERMISSIONS.length)
    })
  })
}
