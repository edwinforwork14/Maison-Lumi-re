import { useEffect, useState } from 'react'
import { Link, type LinkProps } from '@tanstack/react-router'

/**
 * Toaster superior (Plan 04 §2.13): `role="status"`, entra desde arriba
 * (`translateY(-101%) → 0` en .15 s) y se retira a los 2500 ms. Un cambio
 * de `message` reinicia el temporizador, de modo que cada aviso se muestra
 * completo.
 */
export function Toaster({
  message,
  action,
  timing = 2500,
}: {
  message: string
  action?: { label: string; linkProps: LinkProps }
  timing?: number
}) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!message) return
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), timing)
    return () => clearTimeout(timer)
  }, [message, timing])

  if (!message) return null

  return (
    <div
      role="status"
      className={`fixed inset-x-0 top-0 z-[60] flex items-center justify-between gap-4 bg-frost px-5 py-4 shadow-frost backdrop-blur-[10px] transition-transform duration-150 ${
        visible ? 'translate-y-0' : '-translate-y-[101%]'
      }`}
    >
      <p className="body-text">{message}</p>
      {action && (
        <Link
          {...action.linkProps}
          className="body-text shrink-0 underline underline-offset-4 hover:text-text-secondary"
        >
          {action.label}
        </Link>
      )}
    </div>
  )
}
