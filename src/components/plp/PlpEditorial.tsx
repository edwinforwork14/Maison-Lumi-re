/**
 * Cabecera editorial de la PLP (Plan 04 §2.4 y §2.5):
 *
 * 1. Banner a sangre, sin gutter, sin texto, sin CTA. Proporción 4/5 en
 *    móvil/tablet y 16/9 en ≥1024 px.
 * 2. `.editorial-row`: el título NO es un display grande — es un `h2` de
 *    23/31 px en mayúsculas con tracking negativo, y la descripción va a la
 *    derecha del título (columna 9 en desktop), no debajo.
 */
export function PlpEditorial({
  title,
  description,
  bannerSrc,
  bannerAlt = '',
}: {
  readonly title: string
  readonly description?: string | null
  readonly bannerSrc?: string
  readonly bannerAlt?: string
}) {
  return (
    <>
      {bannerSrc && (
        <div className="w-full overflow-hidden bg-subtle">
          <picture>
            <source media="(min-width: 1024px)" srcSet={bannerSrc} />
            <img
              src={bannerSrc}
              alt={bannerAlt}
              className="aspect-[4/5] w-full object-cover md:aspect-[4/5] lg:aspect-video"
            />
          </picture>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-5 md:px-10">
        <div className="mb-12 flex flex-wrap gap-x-10 pt-5 md:mb-16">
          <h1 className="editorial-title w-full md:w-[calc(25%_-_10px)]">{title}</h1>
          {description && (
            <p className="body-text mt-3 w-full text-text-secondary md:mt-0 md:w-[calc(33.333%_-_14px)] md:pt-1 lg:ml-[calc(33.333%_+_40px)] lg:w-[calc(33.333%_-_27px)]">
              {description}
            </p>
          )}
        </div>
      </div>
    </>
  )
}
