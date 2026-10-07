import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '../../src/server/db/schema/index.ts'
import { hashPassword } from '../../src/server/runtime/password-hasher.ts'
import { seedRbac, assignRoleToUser } from '../../src/server/db/seed/rbac.ts'
import { createPostgresSessionsRepository } from '../../src/server/db/repositories/sessions.postgres.ts'
import { resolveAdminActor } from '../../src/server/services/admin/actor.ts'
import {
  createAdminProduct,
  createAdminProductWithVariant,
  createAdminProductWithVariants,
  getAdminProduct,
  listAdminCategories,
  setAdminProductStatus,
  upsertAdminCategory,
  upsertAdminVariant,
  deleteAdminVariant,
  adjustAdminInventory,
} from '../../src/server/services/admin/catalog-admin.ts'
import { createPostgresAuditRepository } from '../../src/server/db/repositories/audit.postgres.ts'
import type { RoleKey } from '../../src/server/services/admin/permissions.ts'

/**
 * Plan 02, G2 completo: variantes y categorías con CRUD auditado.
 *
 * Lo que se comprueba aquí es lo que rompe un catálogo real: SKU duplicado,
 * variante borrada que ya está en pedidos, stock que impide borrar, ciclos en el
 * árbol de categorías y slug repetido en el mismo nivel.
 */

const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL
if (!url) console.warn('[tests/db/catalog-admin] DATABASE_URL no definida: suite omitida.')
const suite = url ? describe : describe.skip

if (url) {
  const client = postgres(url, { max: 5, onnotice: () => {} })
  const db = drizzle(client, { schema })
  const SECRET = 'secreto-de-pruebas-catalogo-con-mas-de-32-caracteres'

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
      VALUES (${`cat-${role}-${t}@example.com`}, ${hashPassword('Cat-Pass-1234')}) RETURNING id`
    await assignRoleToUser({ userId: user!.id, roleKey: role }, db)
    const sessions = createPostgresSessionsRepository(db, SECRET)
    const issued = await sessions.issue({ userId: user!.id, kind: 'admin' })
    return { actor: await resolveAdminActor(issued.cookieValue, db, SECRET), userId: user!.id }
  }

  async function productOf(actor: Awaited<ReturnType<typeof resolveAdminActor>>) {
    const t = token()
    const [category] = await client<{ id: string }[]>`
      INSERT INTO categories (slug, name) VALUES (${`c-${t}`}, 'Cat') RETURNING id`
    const created = await createAdminProduct(
      actor,
      { slug: `variantes-${t}`, name: `Producto ${t}`, categoryId: category!.id },
      db,
    )
    return created.id
  }

  suite('G2 · variantes: crear, editar, borrar con protección de histórico', () => {
    it('crea la variante con su fila de existencias para que sea vendible', async () => {
      const { actor } = await actorWithRole('editor')
      const productId = await productOf(actor)

      const created = await upsertAdminVariant(
        actor,
        { productId, sku: `SKU-${token()}`, size: 'M', color: 'Negro', priceCents: 28_000 },
        db,
      )
      assert.equal(created.created, true)

      const detail = await getAdminProduct(actor, productId, db)
      assert.equal(detail.variants.length, 1)
      assert.equal(detail.variants[0]!.priceCents, 28_000)
      assert.equal(detail.variants[0]!.onHand, 0, 'nace con existencias a cero, no sin fila')

      const [stockRow] = await client<{ n: string }[]>`
        SELECT count(*)::text AS n FROM inventory_items WHERE variant_id = ${created.id}`
      assert.equal(Number(stockRow!.n), 1)
    })

    it('rechaza SKU duplicado con CONFLICT', async () => {
      const { actor } = await actorWithRole('editor')
      const productId = await productOf(actor)
      const sku = `SKU-${token()}`
      await upsertAdminVariant(
        actor,
        { productId, sku, size: 'M', color: 'Negro', priceCents: 10_000 },
        db,
      )
      await assert.rejects(
        upsertAdminVariant(
          actor,
          { productId, sku, size: 'L', color: 'Marfil', priceCents: 12_000 },
          db,
        ),
        (error: unknown) => {
          assert.equal((error as { code?: string }).code, 'CONFLICT')
          return true
        },
      )
    })

    it('rechaza un precio tachado menor que el actual', async () => {
      const { actor } = await actorWithRole('editor')
      const productId = await productOf(actor)
      await assert.rejects(
        upsertAdminVariant(
          actor,
          {
            productId,
            sku: `SKU-${token()}`,
            size: 'M',
            color: 'Negro',
            priceCents: 20_000,
            compareAtPriceCents: 15_000,
          },
          db,
        ),
        (error: unknown) => (error as { code?: string }).code === 'VALIDATION',
      )
    })

    it('editar una variante deja before/after en la auditoría', async () => {
      const { actor } = await actorWithRole('editor')
      const productId = await productOf(actor)
      const created = await upsertAdminVariant(
        actor,
        { productId, sku: `SKU-${token()}`, size: 'M', color: 'Negro', priceCents: 10_000 },
        db,
      )
      await upsertAdminVariant(
        actor,
        {
          id: created.id,
          productId,
          sku: `SKU-${token()}`,
          size: 'M',
          color: 'Negro',
          priceCents: 12_500,
          status: 'active',
        },
        db,
      )

      const audit = createPostgresAuditRepository(db)
      const entries = await audit.listByEntity('product_variants', created.id)
      assert.equal(entries.length, 2)
      assert.deepEqual(
        entries.map((entry) => entry.action).sort(),
        ['variant.create', 'variant.update'],
      )
    })

    it('no borra una variante con stock: primero hay que ajustarlo a cero', async () => {
      const { actor } = await actorWithRole('super_admin')
      const productId = await productOf(actor)
      const created = await upsertAdminVariant(
        actor,
        { productId, sku: `SKU-${token()}`, size: 'M', color: 'Negro', priceCents: 9_000 },
        db,
      )
      await adjustAdminInventory(
        actor,
        { variantId: created.id, delta: 3, reason: 'purchase', note: 'Reposición' },
        db,
      )

      await assert.rejects(
        deleteAdminVariant(actor, created.id, db),
        (error: unknown) => {
          assert.equal((error as { code?: string }).code, 'CONFLICT')
          assert.match((error as { message?: string }).message ?? '', /stock/i)
          return true
        },
      )

      // Con el stock a cero, el borrado archiva en lugar de destruir: el ledger
      // es append-only y la variante ya tiene historia.
      await adjustAdminInventory(
        actor,
        { variantId: created.id, delta: -3, reason: 'correction', note: 'Retirada' },
        db,
      )
      const archived = await deleteAdminVariant(actor, created.id, db)
      assert.deepEqual(archived, { deleted: false, archived: true })

      const [row] = await client<{ status: string }[]>`
        SELECT status FROM product_variants WHERE id = ${created.id}`
      assert.equal(row!.status, 'archived')

      // Una variante sin historia comercial sí se borra de verdad.
      const fresh = await upsertAdminVariant(
        actor,
        { productId, sku: `SKU-${token()}`, size: 'Única', color: 'Marfil', priceCents: 4_000 },
        db,
      )
      const deleted = await deleteAdminVariant(actor, fresh.id, db)
      assert.deepEqual(deleted, { deleted: true, archived: false })
    })

    it('no borra una variante que aparece en pedidos', async () => {
      const { actor } = await actorWithRole('super_admin')
      const productId = await productOf(actor)
      const created = await upsertAdminVariant(
        actor,
        { productId, sku: `SKU-${token()}`, size: 'M', color: 'Negro', priceCents: 9_000 },
        db,
      )
      const t = token()
      const [order] = await client<{ id: string }[]>`
        INSERT INTO orders (number, email, subtotal_cents, total_cents)
        VALUES (${`ML-VAR-${t}`}, 'var@example.com', 9000, 9000) RETURNING id`
      await client`
        INSERT INTO order_items (order_id, variant_id, sku_snapshot, name_snapshot,
                                 unit_price_cents, quantity, line_total_cents)
        VALUES (${order!.id}, ${created.id}, 'SKU', 'Producto', 9000, 1, 9000)`

      await assert.rejects(
        deleteAdminVariant(actor, created.id, db),
        (error: unknown) => {
          assert.equal((error as { code?: string }).code, 'CONFLICT')
          assert.match((error as { message?: string }).message ?? '', /pedidos/i)
          return true
        },
      )
    })

    it('publicar exige variante: con una creada, ya se puede', async () => {
      const { actor } = await actorWithRole('editor')
      const productId = await productOf(actor)
      await assert.rejects(
        setAdminProductStatus(actor, { id: productId, status: 'active' }, db),
        /variantes/i,
      )
      await upsertAdminVariant(
        actor,
        { productId, sku: `SKU-${token()}`, size: 'Única', color: 'Negro', priceCents: 5_000 },
        db,
      )
      const published = await setAdminProductStatus(actor, { id: productId, status: 'active' }, db)
      assert.equal(published.status, 'active')
    })
  })

  suite('G2 · categorías: árbol sin ciclos ni slugs repetidos', () => {
    it('crea y lista categorías con su número de productos', async () => {
      const { actor } = await actorWithRole('editor')
      const t = token()
      const created = await upsertAdminCategory(
        actor,
        { slug: `cat-${t}`, name: `Categoría ${t}`, status: 'active' },
        db,
      )
      assert.equal(created.created, true)

      const rows = await listAdminCategories(actor, db)
      const row = rows.find((entry) => entry.id === created.id)
      assert.ok(row)
      assert.equal(row!.productCount, 0)
    })

    it('rechaza slug repetido en el mismo nivel', async () => {
      const { actor } = await actorWithRole('editor')
      const slug = `dup-${token()}`
      await upsertAdminCategory(actor, { slug, name: 'Una' }, db)
      await assert.rejects(
        upsertAdminCategory(actor, { slug, name: 'Otra' }, db),
        (error: unknown) => (error as { code?: string }).code === 'CONFLICT',
      )
    })

    it('rechaza una jerarquía con ciclo', async () => {
      const { actor } = await actorWithRole('editor')
      const t = token()
      const parent = await upsertAdminCategory(actor, { slug: `padre-${t}`, name: 'Padre' }, db)
      const child = await upsertAdminCategory(
        actor,
        { slug: `hijo-${t}`, name: 'Hijo', parentId: parent.id },
        db,
      )
      await assert.rejects(
        upsertAdminCategory(actor, { id: parent.id, slug: `padre-${t}`, name: 'Padre', parentId: child.id }, db),
        (error: unknown) => (error as { code?: string }).code === 'CONFLICT',
      )
      await assert.rejects(
        upsertAdminCategory(actor, { id: parent.id, slug: `padre-${t}`, name: 'Padre', parentId: parent.id }, db),
        (error: unknown) => (error as { code?: string }).code === 'VALIDATION',
      )
    })

    it('una categoría con padre se puede anidar y editar con auditoría', async () => {
      const { actor } = await actorWithRole('editor')
      const t = token()
      const parent = await upsertAdminCategory(actor, { slug: `raiz-${t}`, name: 'Raíz' }, db)
      const child = await upsertAdminCategory(
        actor,
        { slug: `sub-${t}`, name: 'Sub', parentId: parent.id, position: 2 },
        db,
      )
      await upsertAdminCategory(
        actor,
        { id: child.id, slug: `sub-${t}`, name: 'Sub renombrada', parentId: parent.id, status: 'active' },
        db,
      )
      const rows = await listAdminCategories(actor, db)
      const row = rows.find((entry) => entry.id === child.id)
      assert.equal(row!.name, 'Sub renombrada')
      assert.equal(row!.parentId, parent.id)

      const audit = createPostgresAuditRepository(db)
      const entries = await audit.listByEntity('categories', child.id)
      assert.equal(entries.length, 2)
    })

    it('`support` no gestiona el catálogo', async () => {
      const { actor } = await actorWithRole('support')
      await assert.rejects(
        upsertAdminCategory(actor, { slug: `no-${token()}`, name: 'No' }, db),
        (error: unknown) => (error as { code?: string }).code === 'FORBIDDEN',
      )
    })
  })

  suite('Alta en un solo paso: producto + variante + stock', () => {
    it('crea producto, variante y existencias de una vez, en borrador', async () => {
      const { actor } = await actorWithRole('editor')
      const t = token()
      const [category] = await client<{ id: string }[]>`
        INSERT INTO categories (slug, name) VALUES (${`c-${t}`}, 'Cat') RETURNING id`
      const sku = `SKU-${t}`

      const created = await createAdminProductWithVariant(
        actor,
        {
          slug: `producto-${t}`,
          name: `Producto ${t}`,
          categoryId: category!.id,
          variant: { sku, color: 'Marfil', size: 'M', priceCents: 24_500, initialStock: 7 },
        },
        db,
      )

      assert.equal(created.status, 'draft')
      const detail = await getAdminProduct(actor, created.id, db)
      assert.equal(detail.status, 'draft')
      assert.equal(detail.publishedAt, null)
      assert.equal(detail.variants.length, 1, 'nace con una variante, no vacío')
      assert.equal(detail.variants[0]!.sku, sku)
      assert.equal(detail.variants[0]!.priceCents, 24_500)
      assert.equal(detail.variants[0]!.onHand, 7, 'el stock inicial llega a existencias')
    })

    it('con publish nace activo, con published_at y variante activa', async () => {
      const { actor } = await actorWithRole('editor')
      const t = token()
      const [category] = await client<{ id: string }[]>`
        INSERT INTO categories (slug, name) VALUES (${`c-${t}`}, 'Cat') RETURNING id`

      const created = await createAdminProductWithVariant(
        actor,
        {
          slug: `publicado-${t}`,
          name: `Publicado ${t}`,
          categoryId: category!.id,
          variant: { sku: `SKU-${t}`, color: 'Negro', priceCents: 10_000, initialStock: 3 },
          publish: true,
        },
        db,
      )

      assert.equal(created.status, 'active')
      const detail = await getAdminProduct(actor, created.id, db)
      assert.equal(detail.status, 'active')
      assert.ok(detail.publishedAt, 'publicado exige published_at')
      assert.equal(detail.variants[0]!.status, 'active')
    })

    it('la auditoría registra producto, variante y publicación', async () => {
      const { actor } = await actorWithRole('editor')
      const t = token()
      const [category] = await client<{ id: string }[]>`
        INSERT INTO categories (slug, name) VALUES (${`c-${t}`}, 'Cat') RETURNING id`

      const created = await createAdminProductWithVariant(
        actor,
        {
          slug: `auditado-${t}`,
          name: `Auditado ${t}`,
          categoryId: category!.id,
          variant: { sku: `SKU-${t}`, color: 'Negro', priceCents: 9_000 },
          publish: true,
        },
        db,
      )

      const audit = createPostgresAuditRepository(db)
      const productEntries = await audit.listByEntity('products', created.id)
      assert.deepEqual(
        productEntries.map((entry) => entry.action).sort(),
        ['product.create', 'product.publish'],
      )
      const variantEntries = await audit.listByEntity('product_variants', created.variantId)
      assert.equal(variantEntries.length, 1)
      assert.equal(variantEntries[0]!.action, 'variant.create')
    })

    it('rechaza slug y SKU duplicados con CONFLICT', async () => {
      const { actor } = await actorWithRole('editor')
      const t = token()
      const [category] = await client<{ id: string }[]>`
        INSERT INTO categories (slug, name) VALUES (${`c-${t}`}, 'Cat') RETURNING id`
      const base = {
        slug: `dup-base-${t}`,
        name: `Base ${t}`,
        categoryId: category!.id,
        variant: { sku: `SKU-BASE-${t}`, color: 'Negro', priceCents: 5_000 },
      }
      await createAdminProductWithVariant(actor, base, db)

      await assert.rejects(
        createAdminProductWithVariant(actor, base, db),
        (error: unknown) => (error as { code?: string }).code === 'CONFLICT',
      )
      await assert.rejects(
        createAdminProductWithVariant(
          actor,
          { ...base, slug: `dup-otro-${t}`, variant: { ...base.variant } },
          db,
        ),
        (error: unknown) => (error as { code?: string }).code === 'CONFLICT',
      )
    })

    it('valida precio y stock antes de tocar la base de datos', async () => {
      const { actor } = await actorWithRole('editor')
      const t = token()
      const [category] = await client<{ id: string }[]>`
        INSERT INTO categories (slug, name) VALUES (${`c-${t}`}, 'Cat') RETURNING id`
      const base = {
        slug: `valida-${t}`,
        name: `Valida ${t}`,
        categoryId: category!.id,
      }

      await assert.rejects(
        createAdminProductWithVariant(
          actor,
          { ...base, variant: { sku: `SKU-A-${t}`, color: 'Negro', priceCents: 10_000, initialStock: 1.5 } },
          db,
        ),
        (error: unknown) => (error as { code?: string }).code === 'VALIDATION',
      )
      await assert.rejects(
        createAdminProductWithVariant(
          actor,
          {
            ...base,
            variant: {
              sku: `SKU-B-${t}`,
              color: 'Negro',
              priceCents: 10_000,
              compareAtPriceCents: 8_000,
            },
          },
          db,
        ),
        (error: unknown) => (error as { code?: string }).code === 'VALIDATION',
      )
    })

    it('`support` no puede dar de alta productos', async () => {
      const { actor } = await actorWithRole('support')
      await assert.rejects(
        createAdminProductWithVariant(
          actor,
          {
            slug: `no-${token()}`,
            name: 'No',
            categoryId: '00000000-0000-0000-0000-000000000000',
            variant: { sku: `SKU-NO-${token()}`, color: 'Negro', priceCents: 1_000 },
          },
          db,
        ),
        (error: unknown) => (error as { code?: string }).code === 'FORBIDDEN',
      )
    })
  })

  suite('Alta completa (estilo KAOZ): varios colores, tallas y stock', () => {
    async function category() {
      const t = token()
      const [row] = await client<{ id: string }[]>`
        INSERT INTO categories (slug, name) VALUES (${`c-${t}`}, 'Cat') RETURNING id`
      return row!.id
    }

    it('crea un producto con todos los pares color/talla y su stock', async () => {
      const { actor } = await actorWithRole('editor')
      const t = token()
      const created = await createAdminProductWithVariants(
        actor,
        {
          slug: `kaoz-${t}`,
          name: `Kaoz ${t}`,
          categoryId: await category(),
          priceCents: 19_900,
          compareAtPriceCents: 24_900,
          variants: [
            {
              color: 'Marfil',
              colorHex: '#f4f2ec',
              sizes: [
                { size: 'S', stock: 3 },
                { size: 'M', stock: 5 },
              ],
            },
            {
              color: 'Negro',
              colorHex: '#111111',
              sizes: [{ size: 'M', stock: 2 }],
            },
          ],
        },
        db,
      )

      assert.equal(created.status, 'draft')
      assert.equal(created.variantIds.length, 3)
      const detail = await getAdminProduct(actor, created.id, db)
      assert.equal(detail.variants.length, 3)
      assert.equal(detail.variants.reduce((sum, variant) => sum + variant.onHand, 0), 10)
      assert.ok(detail.variants.every((variant) => variant.priceCents === 19_900))

      const hexes = await client<{ color: string; color_hex: string }[]>`
        SELECT color, color_hex FROM product_variants WHERE product_id = ${created.id}`
      assert.equal(hexes.find((row) => row.color === 'Marfil')!.color_hex, '#f4f2ec')
    })

    it('genera SKUs automáticos cuando faltan y rechaza repetidos', async () => {
      const { actor } = await actorWithRole('editor')
      const t = token()
      const slug = `auto-${t}`
      const created = await createAdminProductWithVariants(
        actor,
        {
          slug,
          name: `Auto ${t}`,
          categoryId: await category(),
          priceCents: 5_000,
          variants: [{ color: 'Marfil', sizes: [{ size: 'Única', stock: 1 }] }],
        },
        db,
      )
      const [row] = await client<{ sku: string }[]>`
        SELECT sku FROM product_variants WHERE product_id = ${created.id}`
      assert.equal(row!.sku, `${slug}-MARFIL-UNICA`)

      await assert.rejects(
        createAdminProductWithVariants(
          actor,
          {
            slug: `dup-${t}`,
            name: `Dup ${t}`,
            categoryId: await category(),
            priceCents: 5_000,
            variants: [{ color: 'Marfil', sizes: [{ size: 'M', sku: 'MISMO' }, { size: 'L', sku: 'MISMO' }] }],
          },
          db,
        ),
        (error: unknown) => (error as { code?: string }).code === 'VALIDATION',
      )
    })

    it('crea la marca si no existe y la reutiliza si ya está', async () => {
      const { actor } = await actorWithRole('editor')
      const t = token()
      const brandName = `Firma ${t}`
      const created = await createAdminProductWithVariants(
        actor,
        {
          slug: `marca-${t}`,
          name: `Con marca ${t}`,
          categoryId: await category(),
          brandName,
          priceCents: 7_500,
          variants: [{ color: 'Negro', sizes: [{ size: 'Única', stock: 1 }] }],
        },
        db,
      )
      const [productRow] = await client<{ brand_id: string | null }[]>`
        SELECT brand_id FROM products WHERE id = ${created.id}`
      assert.ok(productRow!.brand_id, 'la marca nueva queda asociada')

      const [brandRow] = await client<{ id: string; name: string }[]>`
        SELECT id, name FROM brands WHERE id = ${productRow!.brand_id}`
      assert.equal(brandRow!.name, brandName)
    })

    it('con publish nace activo, con published_at y variantes activas', async () => {
      const { actor } = await actorWithRole('editor')
      const t = token()
      const created = await createAdminProductWithVariants(
        actor,
        {
          slug: `pub-${t}`,
          name: `Publicado ${t}`,
          categoryId: await category(),
          priceCents: 12_000,
          publish: true,
          variants: [{ color: 'Marfil', sizes: [{ size: 'S', stock: 4 }] }],
        },
        db,
      )
      assert.equal(created.status, 'active')
      const detail = await getAdminProduct(actor, created.id, db)
      assert.equal(detail.status, 'active')
      assert.ok(detail.publishedAt)
      assert.equal(detail.variants[0]!.status, 'active')
    })

    it('rechaza un producto sin variantes', async () => {
      const { actor } = await actorWithRole('editor')
      await assert.rejects(
        createAdminProductWithVariants(
          actor,
          {
            slug: `vacio-${token()}`,
            name: 'Vacío',
            categoryId: await category(),
            priceCents: 1_000,
            variants: [],
          },
          db,
        ),
        (error: unknown) => (error as { code?: string }).code === 'VALIDATION',
      )
    })

    it('`support` no puede dar de alta productos completos', async () => {
      const { actor } = await actorWithRole('support')
      await assert.rejects(
        createAdminProductWithVariants(
          actor,
          {
            slug: `no-full-${token()}`,
            name: 'No',
            categoryId: '00000000-0000-0000-0000-000000000000',
            priceCents: 1_000,
            variants: [{ color: 'Negro', sizes: [{ size: 'Única' }] }],
          },
          db,
        ),
        (error: unknown) => (error as { code?: string }).code === 'FORBIDDEN',
      )
    })
  })
}
