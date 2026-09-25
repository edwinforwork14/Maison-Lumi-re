/**
 * Confirmación del pedido por WhatsApp (no hay pasarela de pago).
 *
 * Decisión de negocio: la tienda **no cobra**; el pedido se registra con su
 * stock reservado y el cliente cierra la compra hablando con la tienda por
 * WhatsApp, con el resumen ya redactado.
 *
 * El mensaje se construye con una función **pura** para poder probarlo: el
 * formato del texto es lo único que el cliente ve de este flujo.
 */

import type { CartQuote } from '@/server/services/cart-quote'

/** Cuenta de WhatsApp de la tienda, en formato internacional sin signos. */
export interface WhatsAppContact {
  /** Sólo dígitos, con prefijo país (p. ej. `34600111222`). */
  readonly phone: string
  readonly displayName: string
}

export interface OrderSummaryForWhatsApp {
  readonly orderNumber: string
  readonly customerName: string
  readonly city: string
  readonly shippingLabel: string
  readonly quote: CartQuote
}

/** Normaliza un número escrito por una persona: `+34 600-11-12-22` → `34600111222`. */
export function normalizeWhatsAppPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/[^\d]/g, '')
  return digits.length >= 8 ? digits : null
}

/**
 * Texto del mensaje. Sin markdown exótico y con saltos de línea simples: el
 * enlace de WhatsApp lo abre la app y respeta los saltos.
 */
export function buildWhatsAppOrderMessage(summary: OrderSummaryForWhatsApp): string {
  const lines: string[] = []
  lines.push(`Hola, quiero confirmar el pedido ${summary.orderNumber} de Maison Lumière.`)
  lines.push('')
  lines.push('Artículos:')
  for (const line of summary.quote.lines) {
    lines.push(
      `• ${line.name} (${line.color}) ×${line.quantity} — ${formatCents(line.lineTotal.amount)}`,
    )
  }
  lines.push('')
  lines.push(`Subtotal: ${formatCents(summary.quote.subtotal.amount)}`)
  lines.push(
    `Envío (${summary.shippingLabel}): ${
      summary.quote.shipping.amount === 0
        ? 'gratuito'
        : formatCents(summary.quote.shipping.amount)
    }`,
  )
  lines.push(`Total: ${formatCents(summary.quote.total.amount)}`)
  lines.push('')
  lines.push(`A nombre de: ${summary.customerName}`)
  lines.push(`Ciudad: ${summary.city}`)
  return lines.join('\n')
}

function formatCents(cents: number): string {
  const euros = cents / 100
  return `${euros.toFixed(2).replace('.', ',')} €`
}

export interface WhatsAppLink {
  readonly href: string
  readonly message: string
}

/**
 * Enlace `wa.me` con el mensaje ya escrito. Devuelve `null` si no hay número
 * configurado: la UI debe entonces ofrecer el contacto alternativo en lugar de
 * un botón roto.
 */
export function buildWhatsAppOrderLink(
  contact: WhatsAppContact | null,
  summary: OrderSummaryForWhatsApp,
): WhatsAppLink | null {
  const phone = normalizeWhatsAppPhone(contact?.phone)
  if (!phone) return null
  const message = buildWhatsAppOrderMessage(summary)
  return {
    href: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
    message,
  }
}
