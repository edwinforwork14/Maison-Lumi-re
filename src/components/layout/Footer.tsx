import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { NavCategory } from './MegaMenu'

/**
 * Pie de la referencia (Plan 04 §2.15): logo → newsletter en columna con
 * socials → grupos de enlaces → copyright con ubicación y moneda.
 * Se conserva el grupo «Tienda» con las categorías reales (la prop sigue
 * llegando del layout); es una desviación consciente respecto a la
 * referencia, que no enlaza a categorías propias.
 */
export function Footer({ categories }: { readonly categories: readonly NavCategory[] }) {
  const [email, setEmail] = useState('')
  const [title, setTitle] = useState('Sr.')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [consent, setConsent] = useState(false)
  const [subscribed, setSubscribed] = useState(false)

  const linkCls = 'text-[13px] text-text-primary underline-offset-4 hover:underline'
  const staticCls = 'text-[13px] text-text-secondary'

  return (
    <footer className="mt-24 border-t border-line bg-surface">
      <div className="mx-auto max-w-7xl px-5 md:px-10">
        {/* 1. Wordmark (§2.15) */}
        <p className="pb-24 pt-5 text-center text-[15px] font-medium uppercase tracking-[0.35em]">
          Maison Lumière
        </p>

        {/* 2. Newsletter + socials */}
        <div className="flex flex-wrap gap-x-10 gap-y-12">
          <div className="w-full md:w-[calc(50%-20px)]">
            <p className="body-strong">NEWSLETTER</p>
            <p className="body-text mb-5 mt-3 text-text-secondary">
              Colecciones, historias de atelier y piezas en edición limitada,
              una vez al mes.
            </p>
            {subscribed ? (
              <p className="body-text text-gold" role="status">
                Gracias. Pronto recibirá su primera carta.
              </p>
            ) : (
              <form
                className="grid gap-4 sm:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (email.includes('@')) setSubscribed(true)
                }}
              >
                <label className="sm:col-span-2">
                  <span className="sr-only">Correo electrónico</span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Correo electrónico"
                    className="field-flush"
                  />
                </label>
                <label>
                  <span className="sr-only">Tratamiento</span>
                  <select
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="field-flush"
                  >
                    <option value="Sr.">Sr.</option>
                    <option value="Sra.">Sra.</option>
                  </select>
                </label>
                <label>
                  <span className="sr-only">Nombre</span>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Nombre"
                    className="field-flush"
                  />
                </label>
                <label>
                  <span className="sr-only">Apellidos</span>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Apellidos"
                    className="field-flush"
                  />
                </label>
                <div className="flex items-start gap-3 sm:col-span-2">
                  <input
                    id="newsletter-consent"
                    type="checkbox"
                    required
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-0.5 size-4 shrink-0 cursor-pointer appearance-none border border-line-medium bg-surface transition-colors checked:border-strong checked:bg-strong"
                  />
                  <label htmlFor="newsletter-consent" className="body-text text-text-secondary">
                    He leído y acepto la política de privacidad.
                  </label>
                </div>
                <div className="sm:col-span-2">
                  <button type="submit" className="btn btn-outline label">
                    Suscribirse
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="w-full md:w-[calc(50%-20px)]">
            <p className="body-strong">SÍGANOS</p>
            <ul className="mt-3 flex gap-5">
              <li>
                <span className={staticCls}>Instagram</span>
              </li>
              <li>
                <span className={staticCls}>Pinterest</span>
              </li>
              <li>
                <span className={staticCls}>YouTube</span>
              </li>
            </ul>
          </div>
        </div>

        {/* 3. Grupos de enlaces (§2.15) */}
        <nav className="mt-12 grid grid-cols-2 gap-x-6 gap-y-10 md:flex md:flex-wrap md:gap-x-10 md:gap-y-12">
          <div>
            <p className="body-strong">Tienda</p>
            <ul className="mt-3 flex flex-col gap-1">
              <li>
                <Link to="/shop" className={linkCls}>
                  Todo el catálogo
                </Link>
              </li>
              {categories.map((c) => (
                <li key={c.id}>
                  <Link to="/shop" search={{ category: c.id }} className={linkCls}>
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="body-strong">Relaciones con los clientes</p>
            <ul className="mt-3 flex flex-col gap-1">
              <li><span className={staticCls}>Shopping</span></li>
              <li><span className={staticCls}>Envíos</span></li>
              <li><span className={staticCls}>Pagos</span></li>
              <li><span className={staticCls}>Seguir mi pedido</span></li>
              <li><span className={staticCls}>Devoluciones y reembolsos</span></li>
              <li><span className={staticCls}>Instrucciones de cuidado</span></li>
              <li><span className={staticCls}>Solicitar una devolución</span></li>
              <li>
                <Link to="/account" className={linkCls}>
                  Contáctenos
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="body-strong">Boutiques</p>
            <ul className="mt-3 flex flex-col gap-1">
              <li><span className={staticCls}>Encuentre su boutique más cercana</span></li>
              <li><span className={staticCls}>Reservar una cita</span></li>
            </ul>
          </div>

          <div>
            <p className="body-strong">Empresa</p>
            <ul className="mt-3 flex flex-col gap-1">
              <li><span className={staticCls}>Oficinas</span></li>
              <li><span className={staticCls}>Prensa</span></li>
              <li><span className={staticCls}>Carreras</span></li>
            </ul>
          </div>

          <div>
            <p className="body-strong">Legal</p>
            <ul className="mt-3 flex flex-col gap-1">
              <li><span className={staticCls}>Términos de Uso</span></li>
              <li><span className={staticCls}>Términos de venta</span></li>
              <li><span className={staticCls}>Política de Privacidad</span></li>
              <li><span className={staticCls}>Declaración De Accesibilidad</span></li>
              <li><span className={staticCls}>Política de Cookies</span></li>
            </ul>
          </div>
        </nav>

        {/* 4. Copyright (§2.15) */}
        <div className="mt-24 flex flex-wrap items-center justify-between gap-x-8 gap-y-8 pb-8">
          <p className="body-text text-text-secondary">
            Copyright © 2026 Maison Lumière. Todos los derechos reservados.
          </p>
          <p className="body-text flex items-center gap-3 text-text-secondary">
            Cambiar ubicación:
            <span className="text-text-primary">España (español)</span>
            <span className="rounded-[4px] bg-subtle px-2 py-1 text-[10px]">€</span>
          </p>
        </div>
      </div>
    </footer>
  )
}
