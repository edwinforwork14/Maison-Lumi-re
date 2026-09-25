/**
 * Set de iconos propio (Plan 04 §3.2): trazo fino 1.2 px, `currentColor`,
 * tamaño por prop y `aria-hidden` por defecto. Sin dependencias de iconos.
 */

import type { ReactNode } from 'react'

export type IconName =
  | 'menu'
  | 'search'
  | 'heart'
  | 'heart-filled'
  | 'cart'
  | 'close'
  | 'filter'
  | 'chevron-down'
  | 'chevron-right'
  | 'chevron-left'
  | 'account'
  | 'arrow-right'

const paths: Record<IconName, ReactNode> = {
  menu: (
    <>
      <path d="M3 7h18" />
      <path d="M3 12h18" />
      <path d="M3 17h18" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  heart: (
    <path d="M12 20s-7-4.6-9.2-9C1.3 8 2.6 5 5.6 5c2 0 3.3 1.2 4.1 2.3l.7.9.7-.9C11.9 6.2 13.2 5 15.2 5c3 0 4.3 3 2.8 6-2.2 4.4-9.2 9-9.2 9z" />
  ),
  'heart-filled': (
    <path
      d="M12 20s-7-4.6-9.2-9C1.3 8 2.6 5 5.6 5c2 0 3.3 1.2 4.1 2.3l.7.9.7-.9C11.9 6.2 13.2 5 15.2 5c3 0 4.3 3 2.8 6-2.2 4.4-9.2 9-9.2 9z"
      fill="currentColor"
    />
  ),
  cart: (
    <>
      <path d="M6 8h12l-1 12H7L6 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </>
  ),
  close: (
    <>
      <path d="M5 5l14 14" />
      <path d="M19 5 5 19" />
    </>
  ),
  filter: (
    <>
      <path d="M4 7h16" />
      <path d="M7 12h10" />
      <path d="M10 17h4" />
    </>
  ),
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'chevron-right': <path d="m9 6 6 6-6 6" />,
  'chevron-left': <path d="m15 6-6 6 6 6" />,
  account: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
    </>
  ),
  'arrow-right': (
    <>
      <path d="M4 12h16" />
      <path d="m14 6 6 6-6 6" />
    </>
  ),
}

export interface IconProps {
  readonly name: IconName
  /** Tamaño en px (20 por defecto, como la referencia). */
  readonly size?: number
  readonly className?: string
}

export function Icon({ name, size = 20, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {paths[name]}
    </svg>
  )
}
