import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { categories } from '@/data'

export function Footer() {
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(false)

  return (
    <footer className="border-t border-linen bg-sand">
      {/* Newsletter */}
      <section className="mx-auto max-w-7xl px-4 py-16 md:px-8 md:py-20">
        <div className="mx-auto max-w-xl text-center">
          <p className="mb-2 text-[11px] uppercase tracking-[0.3em] text-taupe">
            Newsletter
          </p>
          <h2 className="mb-4 font-serif text-3xl font-light">
            Reciba nuestras novedades
          </h2>
          <p className="mb-8 text-sm text-taupe">
            Colecciones, historias de atelier y piezas en edición limitada, una
            vez al mes.
          </p>
          {subscribed ? (
            <p className="text-sm text-gold">
              Gracias. Pronto recibirá su primera carta.
            </p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (email.includes('@')) setSubscribed(true)
              }}
              className="flex border-b border-ink"
            >
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Su dirección de correo"
                className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-clay"
              />
              <button
                type="submit"
                className="shrink-0 pl-4 text-[11px] uppercase tracking-[0.2em] transition-colors hover:text-taupe"
              >
                Suscribirse
              </button>
            </form>
          )}
        </div>
      </section>

      {/* Columnas */}
      <section className="border-t border-linen">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:grid-cols-4 md:px-8">
          <div>
            <p className="mb-4 font-serif text-lg tracking-[0.2em]">
              MAISON LUMIÈRE
            </p>
            <p className="text-sm leading-relaxed text-taupe">
              Casa de moda y accesorios. Piezas hechas a mano en ateliers
              europeos desde 1987.
            </p>
          </div>
          <div>
            <p className="mb-4 text-[11px] uppercase tracking-[0.25em] text-taupe">
              Tienda
            </p>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link to="/shop" className="hover:text-taupe">
                  Todo el catálogo
                </Link>
              </li>
              {categories.map((c) => (
                <li key={c.id}>
                  <Link
                    to="/shop"
                    search={{ category: c.id }}
                    className="hover:text-taupe"
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-4 text-[11px] uppercase tracking-[0.25em] text-taupe">
              Ayuda
            </p>
            <ul className="space-y-2.5 text-sm">
              <li><span className="cursor-default hover:text-taupe">Envíos y entregas</span></li>
              <li><span className="cursor-default hover:text-taupe">Devoluciones</span></li>
              <li><span className="cursor-default hover:text-taupe">Guía de tallas</span></li>
              <li><span className="cursor-default hover:text-taupe">Cuidado de piezas</span></li>
              <li><Link to="/account" className="hover:text-taupe">Contacto</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-4 text-[11px] uppercase tracking-[0.25em] text-taupe">
              Maison
            </p>
            <ul className="space-y-2.5 text-sm">
              <li><span className="cursor-default hover:text-taupe">Nuestra historia</span></li>
              <li><span className="cursor-default hover:text-taupe">Ateliers</span></li>
              <li><span className="cursor-default hover:text-taupe">Sostenibilidad</span></li>
              <li><span className="cursor-default hover:text-taupe">Instagram</span></li>
              <li><span className="cursor-default hover:text-taupe">Pinterest</span></li>
            </ul>
          </div>
        </div>
      </section>

      {/* Base */}
      <div className="border-t border-linen">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-[11px] uppercase tracking-[0.2em] text-taupe md:flex-row md:px-8">
          <span>© 2026 Maison Lumière</span>
          <div className="flex gap-6">
            <span>Política de privacidad</span>
            <span>Términos</span>
            <span>Cookies</span>
          </div>
          <span>España · EUR €</span>
        </div>
      </div>
    </footer>
  )
}
