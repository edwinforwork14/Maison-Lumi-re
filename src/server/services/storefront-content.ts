/**
 * Contenido público de la portada desde BD (Plan 03, S4).
 *
 * La home consume `homepage_sections` y `banners` publicados y vigentes; el
 * panel puede editarlos sin desplegar. Sin base de datos configurada (modo
 * demo, `DATA_SOURCE=in-memory`) devuelve el contenido por defecto: la tienda
 * nunca se queda sin portada ni rompe el arranque.
 *
 * Contrato de claves (`homepage_sections.key`, vocabulario libre en la BD):
 * - `hero`: portada principal (title = titular, subtitle = antetítulo,
 *   ctaLabel/ctaHref = botón).
 * - `atelier`: bloque editorial (title = titular, subtitle = párrafo).
 */

import { and, asc, eq, or, sql } from 'drizzle-orm'
import { getDb, type Database } from '../db/client.ts'
import { banners, homepageSections } from '../db/schema/content.ts'
import { isPostgresDataSource } from '../runtime/env.ts'

export interface HomepageBlock {
  readonly key: string
  readonly title: string | null
  readonly subtitle: string | null
  readonly ctaLabel: string | null
  readonly ctaHref: string | null
}

export interface HomepageContent {
  /** Bloques por clave (`hero`, `atelier`, …) ordenados por posición. */
  readonly blocks: readonly HomepageBlock[]
}

/** Textos actuales de la portada: son el fallback y el modo sin BD. */
const DEFAULT_BLOCKS: readonly HomepageBlock[] = [
  {
    key: 'hero',
    title: 'La luz de las cosas bien hechas',
    subtitle: 'Colección Lumière · Otoño 2026',
    ctaLabel: 'Descubrir la colección',
    ctaHref: '/shop',
  },
  {
    key: 'atelier',
    title: 'Cada pieza pasa por ochenta manos antes de la suya',
    subtitle:
      'Trabajamos con talleres familiares de Francia, Italia y España. Acetatos pulidos a mano, cueros de curtido vegetal y metal bañado en oro fino. Producción limitada, sin temporadas descartables.',
    ctaLabel: 'Conocer Atelier',
    ctaHref: '/shop?collection=atelier',
  },
]

/** Vigencia: sin inicio/final abierto; con fechas, `now` dentro de la ventana. */
function activeWindow(table: typeof homepageSections | typeof banners) {
  const now = new Date().toISOString()
  return and(
    or(sql`${table.startsAt} is null`, sql`${table.startsAt} <= ${now}`),
    or(sql`${table.endsAt} is null`, sql`${table.endsAt} > ${now}`),
  )
}

/**
 * Portada pública. En postgres lee secciones y banners publicados y vigentes;
 * en modo demo devuelve `DEFAULT_BLOCKS`.
 */
export async function getHomepageContent(db?: Database): Promise<HomepageContent> {
  // Sin base de datos configurada (modo demo) devuelve el contenido por
  // defecto. Un `db` inyectado (tests, scripts) manda sobre el modo del env.
  if (!db && !isPostgresDataSource()) return { blocks: DEFAULT_BLOCKS }

  const database = db ?? getDb()
  const sectionRows = await database
    .select({
      key: homepageSections.key,
      title: homepageSections.title,
      subtitle: homepageSections.subtitle,
      ctaLabel: homepageSections.ctaLabel,
      ctaHref: homepageSections.ctaHref,
      position: homepageSections.position,
    })
    .from(homepageSections)
    .where(
      and(eq(homepageSections.status, 'published'), activeWindow(homepageSections)),
    )
    .orderBy(asc(homepageSections.placement), asc(homepageSections.position))

  const bannerRows = await database
    .select({
      key: banners.key,
      title: banners.title,
      subtitle: banners.subtitle,
      ctaLabel: banners.ctaLabel,
      ctaHref: banners.ctaHref,
      position: banners.position,
    })
    .from(banners)
    .where(and(eq(banners.status, 'published'), activeWindow(banners)))
    .orderBy(asc(banners.placement), asc(banners.position))

  const blocks = [...bannerRows, ...sectionRows].map((row) => ({
    key: row.key,
    title: row.title,
    subtitle: row.subtitle,
    ctaLabel: row.ctaLabel,
    ctaHref: row.ctaHref,
  }))

  // Sin contenido publicado la portada no puede quedarse en blanco.
  return { blocks: blocks.length > 0 ? blocks : DEFAULT_BLOCKS }
}
