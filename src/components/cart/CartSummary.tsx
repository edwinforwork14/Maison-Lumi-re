import { formatPrice } from '@/lib/format'
import type { CartTotals } from '@/data/types'

interface CartSummaryProps {
  totals: CartTotals
  shippingLabel?: string
  cta?: React.ReactNode
}

export function CartSummary({ totals, shippingLabel, cta }: CartSummaryProps) {
  return (
    <div className="bg-sand p-8">
      <h2 className="mb-6 text-[11px] uppercase tracking-[0.25em] text-taupe">
        Resumen del pedido
      </h2>
      <dl className="space-y-3 text-sm">
        <div className="flex justify-between">
          <dt>Subtotal</dt>
          <dd className="tabular-nums">{formatPrice(totals.subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>{shippingLabel ?? 'Envío estimado'}</dt>
          <dd>
            {totals.shipping === 0
              ? 'Gratuito'
              : `${formatPrice(totals.shipping)}`}
          </dd>
        </div>
        <div className="flex justify-between border-t border-linen pt-3 text-base">
          <dt className="uppercase tracking-[0.15em]">Total</dt>
          <dd className="font-medium tabular-nums">
            {formatPrice(totals.total)}
          </dd>
        </div>
      </dl>
      {cta && <div className="mt-8">{cta}</div>}
    </div>
  )
}
