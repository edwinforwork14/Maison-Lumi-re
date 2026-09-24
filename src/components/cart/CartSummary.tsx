import { formatMoney } from '@/lib/money-format'
import { isZero, type Money } from '@/domain/money'

/**
 * Resumen del pedido: un único componente reutilizado por carrito y checkout.
 * Recibe importes ya calculados por el servidor (`quoteCart`): no suma nada
 * (defecto D5: una sola verdad del total).
 */
export interface CartSummaryTotals {
  subtotal: Money
  shipping: Money
  total: Money
}

interface CartSummaryProps {
  totals: CartSummaryTotals
  shippingLabel?: string
  cta?: React.ReactNode
}

export function CartSummary({ totals, shippingLabel, cta }: CartSummaryProps) {
  return (
    <div className="bg-sand p-8">
      <h2 className="mb-6 eyebrow">Resumen del pedido</h2>
      <dl className="space-y-3 text-sm">
        <div className="flex justify-between">
          <dt>Subtotal</dt>
          <dd className="tabular-nums">{formatMoney(totals.subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>{shippingLabel ?? 'Envío estimado'}</dt>
          <dd>
            {isZero(totals.shipping) ? 'Gratuito' : formatMoney(totals.shipping)}
          </dd>
        </div>
        <div className="flex justify-between border-t border-linen pt-3 text-base">
          <dt className="uppercase tracking-[0.15em]">Total</dt>
          <dd className="font-medium tabular-nums">{formatMoney(totals.total)}</dd>
        </div>
      </dl>
      {cta && <div className="mt-8">{cta}</div>}
    </div>
  )
}
