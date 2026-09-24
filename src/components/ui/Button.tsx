import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from '@tanstack/react-router'

type Variant = 'primary' | 'outline' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  to?: string
  children: ReactNode
}

const variants: Record<Variant, string> = {
  primary:
    'bg-ink text-ivory hover:bg-charcoal disabled:bg-clay disabled:cursor-not-allowed',
  outline:
    'border border-ink text-ink hover:bg-ink hover:text-ivory disabled:border-clay disabled:text-clay disabled:cursor-not-allowed',
  ghost: 'text-ink hover:text-taupe underline-offset-4 hover:underline',
}

const sizes: Record<Size, string> = {
  sm: 'px-4 py-2 text-[11px]',
  md: 'px-8 py-3 text-xs',
  lg: 'px-10 py-4 text-xs',
}

export function Button({
  variant = 'primary',
  size = 'md',
  to,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const cls = `inline-flex items-center justify-center tracking-[0.2em] uppercase transition-colors duration-300 ${variants[variant]} ${sizes[size]} ${className}`

  if (to) {
    return (
      <Link to={to} className={cls}>
        {children}
      </Link>
    )
  }

  return (
    <button type="button" className={cls} {...rest}>
      {children}
    </button>
  )
}
