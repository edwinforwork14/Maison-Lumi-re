import { useEffect, useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useStore } from '@/lib/store'
import { formatMoney } from '@/lib/money-format'
import { isZero, type Money } from '@/domain/money'
import { placeOrder } from '@/features/commerce.api'
import { useCartQuote } from '@/features/cart/use-cart-quote'
import type { ShippingMethodId } from '@/domain/pricing'

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

/**
 * Checkout. Todo importe visible procede de `quoteCart` — incluidos los precios
 * y la gratuidad de cada método de envío, que ya no están duplicados en el
 * cliente (defectos D5 y D37). La cantidad se contrasta con el stock real del
 * SKU antes de permitir confirmar (defecto D18).
 */
function CheckoutPage() {
  const { cart, clearCart } = useStore()
  const [form, setForm] = useState<FormData>(initialForm)
  const [shipping, setShipping] = useState<ShippingMethodId>('standard')
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})
  const [placedOrderNumber, setPlacedOrderNumber] = useState<string | null>(null)
  const [placedTotal, setPlacedTotal] = useState<Money | null>(null)
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const lines = useMemo(
    () =>
      cart.map((i) => ({
        productId: i.productId,
        color: i.color,
        quantity: i.quantity,
      })),
    [cart],
  )

  // Fuente única de verdad del dinero: el servidor cotiza subtotal, envío y total.
  const { quote, isLoading } = useCartQuote(shipping)

  // Líneas cuya cantidad pedida supera el stock real del SKU (D18).
  const oversold = (quote?.lines ?? []).filter((l) => l.quantity > l.availableStock)
  const blocked = oversold.length > 0

  // Idempotencia: una clave por intento de compra del contenido actual.
  const idempotencyKey = useMemo(
    () =>
      crypto.randomUUID(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines],
  )

  useEffect(() => {
    if (placedOrderNumber) window.scrollTo({ top: 0 })
  }, [placedOrderNumber])

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (lines.length === 0 || blocked || !validate() || submitting) return

    setSubmitting(true)
    setSubmitError('')
    try {
      const result = await placeOrder({
        data: {
          lines,
          shippingMethod: shipping,
          customer: { ...form },
          idempotencyKey,
        },
      })
      setPlacedOrderNumber(result.orderNumber)
      setPlacedTotal(result.total)
      clearCart()
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : 'No se pudo completar el pedido. Inténtelo de nuevo.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Pantalla de éxito ───
  if (placedOrderNumber) {
    return (
      <div className="mx-auto max-w-2xl animate-fade-up px-4 py-24 text-center md:py-32">
        <p className="mb-3 label-wide tracking-[0.3em] text-taupe">
          Pedido confirmado
        </p>
        <h1 className="mb-4 font-serif text-4xl font-light md:text-5xl">
          Gracias por su compra
        </h1>
        <p className="mb-2 text-sm text-taupe">
          Su pedido <span className="text-ink">{placedOrderNumber}</span> ha
          sido registrado correctamente.
        </p>
        <p className="mb-10 text-sm text-taupe">
          Enviaremos la confirmación a {form.email}.
        </p>
        <div className="mx-auto mb-10 max-w-sm bg-sand p-8 text-left text-sm">
          <p className="mb-4 eyebrow">Resumen</p>
          <div className="flex justify-between py-1">
            <span>Total</span>
            <span className="tabular-nums">
              {placedTotal ? formatMoney(placedTotal) : '—'}
            </span>
          </div>
          <div className="flex justify-between py-1 text-taupe">
            <span>Envío</span>
            <span>
              {quote?.shippingOptions.find((o) => o.id === shipping)?.label ??
                shipping}
            </span>
          </div>
        </div>
        <Link to="/shop" className="btn btn-outline px-10 py-4 label-wide">
          Continuar comprando
        </Link>
      </div>
    )
  }

  // ─── Carrito vacío ───
  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="mb-4 font-serif text-3xl font-light">
          Su carrito está vacío
        </h1>
        <p className="mb-10 text-sm text-taupe">
          Añada piezas al carrito para finalizar la compra.
        </p>
        <Link to="/shop" className="btn btn-outline px-8 py-3 label">
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
            <h2 className="mb-6 eyebrow">1 — Información personal</h2>
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
            <h2 className="mb-6 eyebrow">2 — Dirección de envío</h2>
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

          {/* Envío — métodos, precios y gratuidad vienen del servidor */}
          <section>
            <h2 className="mb-6 eyebrow">3 — Método de envío</h2>
            {isLoading || !quote ? (
              <p className="text-sm text-taupe">Calculando opciones de envío…</p>
            ) : (
              <div className="space-y-3">
                {quote.shippingOptions.map((option) => (
                  <label
                    key={option.id}
                    className={`flex cursor-pointer items-center justify-between border px-5 py-4 transition-colors ${
                      shipping === option.id
                        ? 'border-ink'
                        : 'border-linen hover:border-clay'
                    }`}
                  >
                    <span className="flex items-center gap-4">
                      <input
                        type="radio"
                        name="shipping"
                        checked={shipping === option.id}
                        onChange={() => setShipping(option.id)}
                        className="h-3.5 w-3.5 accent-[#1a1815]"
                      />
                      <span>
                        <span className="block text-sm">{option.label}</span>
                        <span className="block text-xs text-taupe">
                          {option.description}
                        </span>
                      </span>
                    </span>
                    <span className="text-sm tabular-nums">
                      {option.free ? 'Gratuito' : formatMoney(option.price)}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Resumen — pintado desde la cotización del servidor */}
        <aside>
          <div className="bg-sand p-8 lg:sticky lg:top-32">
            <h2 className="mb-6 eyebrow">Su pedido</h2>
            <ul className="mb-6 space-y-4 border-b border-linen pb-6">
              {(quote?.lines ?? []).map((line) => (
                <li key={line.variantId} className="flex gap-4">
                  <img
                    src={line.image}
                    alt={line.name}
                    className="h-20 w-14 shrink-0 object-cover"
                  />
                  <div className="flex-1 text-sm">
                    <p>{line.name}</p>
                    <p className="text-xs text-taupe">
                      {line.color} · ×{line.quantity}
                    </p>
                  </div>
                  <span className="text-sm tabular-nums">
                    {formatMoney(line.lineTotal)}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd className="tabular-nums">
                  {quote ? formatMoney(quote.subtotal) : '—'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Envío</dt>
                <dd>
                  {quote && isZero(quote.shipping)
                    ? 'Gratuito'
                    : quote
                      ? formatMoney(quote.shipping)
                      : '—'}
                </dd>
              </div>
              <div className="flex justify-between border-t border-linen pt-3 text-base">
                <dt className="uppercase tracking-[0.15em]">Total</dt>
                <dd className="font-medium tabular-nums">
                  {quote ? formatMoney(quote.total) : '—'}
                </dd>
              </div>
            </dl>
            {blocked && (
              <p className="mt-4 text-xs text-gold">
                {oversold
                  .map(
                    (l) =>
                      `Solo quedan ${l.availableStock} uds. de ${l.name} (${l.color})`,
                  )
                  .join(' · ')}
              </p>
            )}
            {submitError && <p className="mt-4 text-xs text-gold">{submitError}</p>}
            <button
              type="submit"
              disabled={submitting || !quote || blocked}
              className="btn btn-solid btn-block label-wide mt-8 disabled:cursor-not-allowed disabled:bg-clay"
            >
              {submitting ? 'Procesando…' : 'Confirmar pedido'}
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
