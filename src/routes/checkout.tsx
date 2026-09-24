import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useStore } from '@/lib/store'
import { formatPrice, orderNumber } from '@/lib/format'
import { shippingMethods, shippingCostFor, freeShippingThreshold } from '@/data'
import type { ShippingMethodId, Order } from '@/data/types'

export const Route = createFileRoute('/checkout')({
  head: () => ({ meta: [{ title: 'Checkout — Maison Lumière' }] }),
  component: CheckoutPage,
})

interface FormData {
  firstName: string
  lastName: string
  email: string
  address: string
  city: string
  postalCode: string
  country: string
}

const initialForm: FormData = {
  firstName: '',
  lastName: '',
  email: '',
  address: '',
  city: '',
  postalCode: '',
  country: 'España',
}

function CheckoutPage() {
  const { cartTotals, clearCart } = useStore()
  const [form, setForm] = useState<FormData>(initialForm)
  const [shipping, setShipping] = useState<ShippingMethodId>('standard')
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})
  const [placedOrder, setPlacedOrder] = useState<Order | null>(null)

  const shippingCost = shippingCostFor(shipping, cartTotals.subtotal)
  const total = cartTotals.subtotal + shippingCost

  const set = (key: keyof FormData) => (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const validate = (): boolean => {
    const errs: Partial<Record<keyof FormData, string>> = {}
    if (!form.firstName.trim()) errs.firstName = ' obligatorio'
    if (!form.lastName.trim()) errs.lastName = ' obligatorio'
    if (!/^\S+@\S+\.\S+$/.test(form.email)) errs.email = ' Introduzca un email válido'
    if (!form.address.trim()) errs.address = ' obligatorio'
    if (!form.city.trim()) errs.city = ' obligatorio'
    if (!/^\d{4,6}$/.test(form.postalCode)) errs.postalCode = ' código inválido'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (cartTotals.lines.length === 0 || !validate()) return

    const order: Order = {
      number: orderNumber(),
      createdAt: new Date().toISOString(),
      items: cartTotals.lines,
      totals: {
        subtotal: cartTotals.subtotal,
        shipping: shippingCost,
        total,
      },
      customer: { ...form },
      shippingMethod: shipping,
    }
    setPlacedOrder(order)
    clearCart()
    window.scrollTo({ top: 0 })
  }

  // ─── Pantalla de éxito ───
  if (placedOrder) {
    return (
      <div className="mx-auto max-w-2xl animate-fade-up px-4 py-24 text-center md:py-32">
        <p className="mb-3 text-[11px] uppercase tracking-[0.3em] text-taupe">
          Pedido confirmado
        </p>
        <h1 className="mb-4 font-serif text-4xl font-light md:text-5xl">
          Gracias por su compra
        </h1>
        <p className="mb-2 text-sm text-taupe">
          Su pedido <span className="text-ink">{placedOrder.number}</span> ha
          sido registrado correctamente.
        </p>
        <p className="mb-10 text-sm text-taupe">
          Enviaremos la confirmación a {placedOrder.customer.email}.
        </p>
        <div className="mx-auto mb-10 max-w-sm bg-sand p-8 text-left text-sm">
          <p className="mb-4 text-[11px] uppercase tracking-[0.25em] text-taupe">
            Resumen
          </p>
          <div className="flex justify-between py-1">
            <span>Total</span>
            <span className="tabular-nums">
              {formatPrice(placedOrder.totals.total)}
            </span>
          </div>
          <div className="flex justify-between py-1 text-taupe">
            <span>Piezas</span>
            <span>
              {placedOrder.items.reduce((n, l) => n + l.quantity, 0)}
            </span>
          </div>
          <div className="flex justify-between py-1 text-taupe">
            <span>Envío</span>
            <span>
              {shippingMethods.find((m) => m.id === placedOrder.shippingMethod)
                ?.name ?? 'Estándar'}
            </span>
          </div>
        </div>
        <Link
          to="/shop"
          className="border border-ink px-10 py-4 text-[11px] uppercase tracking-[0.25em] transition-colors hover:bg-ink hover:text-ivory"
        >
          Continuar comprando
        </Link>
      </div>
    )
  }

  // ─── Carrito vacío ───
  if (cartTotals.lines.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="mb-4 font-serif text-3xl font-light">
          Su carrito está vacío
        </h1>
        <p className="mb-10 text-sm text-taupe">
          Añada piezas al carrito para finalizar la compra.
        </p>
        <Link
          to="/shop"
          className="border border-ink px-8 py-3 text-[11px] uppercase tracking-[0.2em] transition-colors hover:bg-ink hover:text-ivory"
        >
          Descubrir la colección
        </Link>
      </div>
    )
  }

  const inputCls = (field: keyof FormData) =>
    `w-full border bg-transparent px-4 py-3 text-sm outline-none transition-colors placeholder:text-clay focus:border-ink ${
      errors[field] ? 'border-gold' : 'border-linen'
    }`

  return (
    <div className="mx-auto max-w-7xl animate-fade-in px-4 py-14 md:px-8 md:py-20">
      <h1 className="mb-10 font-serif text-4xl font-light">Checkout</h1>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="grid gap-12 lg:grid-cols-[1fr_380px]"
      >
        <div className="space-y-12">
          {/* Contacto */}
          <section>
            <h2 className="mb-6 text-[11px] uppercase tracking-[0.25em] text-taupe">
              1 — Información personal
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <input
                  className={inputCls('firstName')}
                  placeholder="Nombre *"
                  value={form.firstName}
                  onChange={set('firstName')}
                />
                {errors.firstName && (
                  <p className="mt-1 text-xs text-gold">Nombre{errors.firstName}</p>
                )}
              </div>
              <div>
                <input
                  className={inputCls('lastName')}
                  placeholder="Apellidos *"
                  value={form.lastName}
                  onChange={set('lastName')}
                />
                {errors.lastName && (
                  <p className="mt-1 text-xs text-gold">Apellidos{errors.lastName}</p>
                )}
              </div>
              <div className="md:col-span-2">
                <input
                  className={inputCls('email')}
                  type="email"
                  placeholder="Email *"
                  value={form.email}
                  onChange={set('email')}
                />
                {errors.email && (
                  <p className="mt-1 text-xs text-gold">{errors.email}</p>
                )}
              </div>
            </div>
          </section>

          {/* Dirección */}
          <section>
            <h2 className="mb-6 text-[11px] uppercase tracking-[0.25em] text-taupe">
              2 — Dirección de envío
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <input
                  className={inputCls('address')}
                  placeholder="Dirección *"
                  value={form.address}
                  onChange={set('address')}
                />
                {errors.address && (
                  <p className="mt-1 text-xs text-gold">Dirección{errors.address}</p>
                )}
              </div>
              <div>
                <input
                  className={inputCls('city')}
                  placeholder="Ciudad *"
                  value={form.city}
                  onChange={set('city')}
                />
                {errors.city && (
                  <p className="mt-1 text-xs text-gold">Ciudad{errors.city}</p>
                )}
              </div>
              <div>
                <input
                  className={inputCls('postalCode')}
                  placeholder="Código postal *"
                  value={form.postalCode}
                  onChange={set('postalCode')}
                />
                {errors.postalCode && (
                  <p className="mt-1 text-xs text-gold">{errors.postalCode}</p>
                )}
              </div>
              <div className="md:col-span-2">
                <input
                  className={inputCls('country')}
                  placeholder="País"
                  value={form.country}
                  onChange={set('country')}
                />
              </div>
            </div>
          </section>

          {/* Envío */}
          <section>
            <h2 className="mb-6 text-[11px] uppercase tracking-[0.25em] text-taupe">
              3 — Método de envío
            </h2>
            <div className="space-y-3">
              {shippingMethods.map((m) => (
                <label
                  key={m.id}
                  className={`flex cursor-pointer items-center justify-between border px-5 py-4 transition-colors ${
                    shipping === m.id ? 'border-ink' : 'border-linen hover:border-clay'
                  }`}
                >
                  <span className="flex items-center gap-4">
                    <input
                      type="radio"
                      name="shipping"
                      checked={shipping === m.id}
                      onChange={() => setShipping(m.id)}
                      className="h-3.5 w-3.5 accent-[#1a1815]"
                    />
                    <span>
                      <span className="block text-sm">{m.name}</span>
                      <span className="block text-xs text-taupe">
                        {m.description}
                      </span>
                    </span>
                  </span>
                  <span className="text-sm tabular-nums">
                    {cartTotals.subtotal >= freeShippingThreshold
                      ? 'Gratuito'
                      : formatPrice(m.price)}
                  </span>
                </label>
              ))}
            </div>
          </section>
        </div>

        {/* Resumen */}
        <aside>
          <div className="bg-sand p-8 lg:sticky lg:top-32">
            <h2 className="mb-6 text-[11px] uppercase tracking-[0.25em] text-taupe">
              Su pedido
            </h2>
            <ul className="mb-6 space-y-4 border-b border-linen pb-6">
              {cartTotals.lines.map((line) => (
                <li key={`${line.product.id}-${line.color}`} className="flex gap-4">
                  <img
                    src={line.product.images[0]}
                    alt={line.product.name}
                    className="h-20 w-14 shrink-0 object-cover"
                  />
                  <div className="flex-1 text-sm">
                    <p>{line.product.name}</p>
                    <p className="text-xs text-taupe">
                      {line.color} · ×{line.quantity}
                    </p>
                  </div>
                  <span className="text-sm tabular-nums">
                    {formatPrice(line.lineTotal)}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd className="tabular-nums">{formatPrice(cartTotals.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Envío</dt>
                <dd>
                  {shippingCost === 0 ? 'Gratuito' : formatPrice(shippingCost)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-linen pt-3 text-base">
                <dt className="uppercase tracking-[0.15em]">Total</dt>
                <dd className="font-medium tabular-nums">{formatPrice(total)}</dd>
              </div>
            </dl>
            <button
              type="submit"
              className="mt-8 w-full bg-ink py-4 text-[11px] uppercase tracking-[0.25em] text-ivory transition-colors hover:bg-charcoal"
            >
              Confirmar pedido
            </button>
            <p className="mt-4 text-center text-[11px] text-taupe">
              Pago simulado — sin cargo real
            </p>
          </div>
        </aside>
      </form>
    </div>
  )
}
