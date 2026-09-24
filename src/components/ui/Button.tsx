import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from '@tanstack/react-router'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'outline' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

const variantCls: Record<Variant, string> = {
  primary:
    'bg-ink text-ivory hover:bg-charcoal disabled:bg-clay disabled:cursor-not-allowed',
  outline:
    'border border-ink text-ink hover:bg-ink hover:text-ivory disabled:border-clay disabled:text-clay disabled:cursor-not-allowed',
  ghost: 'text-ink hover:text-taupe underline-offset-4 hover:underline',
}

const sizeCls: Record<Size, string> = {
  sm: 'px-4 py-2 text-[11px]',
  md: 'px-8 py-3 text-xs',
  lg: 'px-10 py-4 text-xs',
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
