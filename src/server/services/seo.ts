/**
 * SEO desde datos (Plan 03, S4): el sitemap y el robots se generan con lo que
 * hay en la base —productos publicados y categorías activas—, no con una lista
 * escrita a mano que se desincroniza al publicar desde el panel.
 */

import { and, eq, sql } from 'drizzle-orm'
import { getDb, type Database } from '../db/client.ts'
import { categories, products } from '../db/schema/catalog.ts'
import { isPostgresDataSource } from '../runtime/env.ts'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export interface SeoEntry {
  readonly loc: string
  readonly lastmod?: string
}

/** Páginas estáticas del sitio: siempre presentes, en el orden del árbol. */
export function staticEntries(baseUrl: string): SeoEntry[] {
  return ['', '/shop', '/cart', '/checkout'].map((path) => ({
    loc: `${baseUrl}${path}`,
  }))
}

/**
 * Catálogo vivo: sólo productos publicados y no borrados.
 *
 * Sin base de datos configurada (modo demo con el catálogo en memoria) se
 * generan desde la semilla: el sitemap nunca debe romper la tienda.
 */
export async function catalogEntries(baseUrl: string, db?: Database): Promise<SeoEntry[]> {
  if (!isPostgresDataSource()) {
    const { catalogRepository } = await import('../seed/catalog.ts')
    const { categories: categorySeeds } = await import('../../data/categories.ts')
    const productSlugs = catalogRepository
      .search({})
      .map((product) => (product as { slug?: string }).slug)
      .filter((slug): slug is string => Boolean(slug))
    return [
      ...categorySeeds.map((category) => ({
        loc: `${baseUrl}/shop?category=${encodeURIComponent(category.slug)}`,
      })),
      ...productSlugs.map((slug) => ({
        loc: `${baseUrl}/products/${encodeURIComponent(slug)}`,
      })),
    ]
  }
  const database = db ?? getDb()
  const productRows = await database
    .select({ slug: products.slug, updatedAt: products.updatedAt })
    .from(products)
    .where(
      and(
        eq(products.status, 'active'),
        sql`${products.deletedAt} is null`,
        sql`${products.publishedAt} is not null`,
      ),
    )
    .orderBy(products.slug)

  const categoryRows = await database
    .select({ slug: categories.slug, updatedAt: categories.updatedAt })
    .from(categories)
    .where(eq(categories.status, 'active'))
    .orderBy(categories.slug)

  return [
    ...categoryRows.map((row) => ({
      loc: `${baseUrl}/shop?category=${encodeURIComponent(row.slug)}`,
      lastmod: row.updatedAt.toISOString(),
    })),
    ...productRows.map((row) => ({
      loc: `${baseUrl}/products/${encodeURIComponent(row.slug)}`,
      lastmod: row.updatedAt.toISOString(),
    })),
  ]
}

export async function buildSitemap(baseUrl: string, db?: Database): Promise<string> {
  const entries = [...staticEntries(baseUrl), ...(await catalogEntries(baseUrl, db))]
  const urls = entries
    .map(
      (entry) =>
        `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>${
          entry.lastmod ? `\n    <lastmod>${entry.lastmod}</lastmod>` : ''
        }\n  </url>`,
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

export function buildRobotsTxt(baseUrl: string): string {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /account',
    'Disallow: /checkout',
    '',
    `Sitemap: ${baseUrl}/api/sitemap.xml`,
    '',
  ].join('\n')
}
