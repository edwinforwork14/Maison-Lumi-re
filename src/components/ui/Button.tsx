import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from '@tanstack/react-router'
import { cn } from '@/lib/cn'

/**
 * Matriz de botones de la referencia (Plan 04 §3.3): una sola medida
 * (`padding: 12px 20px`, `min-height: 48px`, `radius: 4px`, 13 px) — la
 * referencia no tiene escala de tamaños; `size` se conserva por compatibilidad
 * pero `md` es el único realista.
 */
type Variant = 'primary' | 'secondary' | 'outline' | 'frost' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

const variantCls: Record<Variant, string> = {
  // `.button--primary`: fondo negro 95 %, texto blanco, sombra frost.
  primary: 'btn-solid',
  // `.button--secondary`: borde 1 px negro sobre blanco.
  secondary: 'btn-outline',
  // Alias de la piel anterior: mismo trazado que `secondary`.
  outline: 'btn-outline',
  // `.button--frost`: superficie translúcida con blur, sobre imagen.
  frost: 'btn-frost',
  // `.link--tertiary`: sólo texto con subrayado al hover.
  ghost:
    'text-text-primary hover:text-text-secondary underline-offset-4 hover:underline px-0 py-0 min-h-0',
}

const sizeCls: Record<Size, string> = {
  sm: 'px-4 py-2 min-h-9 text-[11px]',
  md: '',
  lg: 'px-7 py-4 min-h-14',
}

function compose(variant: Variant, size: Size, className?: string): string {
  return cn('btn', variantCls[variant], sizeCls[size], className)
}

/**
 * Botón puro (corrige D8: ya no mezcla botón y enlace con `to?: string`).
 * Para navegación use <ButtonLink>, con rutas tipadas por el generador.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
}) {
  return (
    <button type={type} className={compose(variant, size, className)} {...rest}>
      {children}
    </button>
  )
}

/**
 * Enlace con estilo de botón: `to` es una ruta tipada de TanStack Router.
 * Acepta `search` y `params` con verificación en compilación.
 */
export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...rest
}: Omit<LinkProps, 'className'> & {
  variant?: Variant
  size?: Size
  className?: string
}) {
  return (
    <Link className={compose(variant, size, className)} {...rest}>
      {children}
    </Link>
  )
}

/**
 * Enlace con estilo de botón para destinos arbitrarios (contenido administrable
 * de la portada, `ctaHref` libre): rutas internas y externas sin cast.
 */
export function ButtonAnchor({
  href,
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string
  variant?: Variant
  size?: Size
}) {
  return (
    <a href={href} className={compose(variant, size, className)} {...rest}>
      {children}
    </a>
  )
}
