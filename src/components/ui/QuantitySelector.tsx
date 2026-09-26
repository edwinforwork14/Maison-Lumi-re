import { useRipple } from '@/hooks/use-ripple'

interface QuantitySelectorProps {
  value: number
  onChange: (value: number) => void
  min?: number
  /** Máximo disponible: por defecto respeta el stock real (defecto D18). */
  max?: number
}

/**
 * Stepper de cantidad accesible: los botones se desactivan en los límites
 * y el valor se anuncia a lectores de pantalla. Medida de la referencia:
 * 48 px de alto, borde de línea, texto a 13 px (Plan 04 §3.4).
 */
export function QuantitySelector({
  value,
  onChange,
  min = 1,
  max = 10,
}: QuantitySelectorProps) {
  // Onda expansiva en los controles del stepper (Plan 05 §5.3): host con
  // `ripple-host` porque estos botones no usan `.btn`.
  const { onPointerDown, onKeyDown } = useRipple()
  const rippleProps = { onPointerDown, onKeyDown } as const

  return (
    <div className="inline-flex h-12 items-center border border-line bg-surface">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="ripple-host w-12 self-stretch text-text-secondary transition-colors hover:text-strong disabled:cursor-not-allowed disabled:text-line-light"
        aria-label="Disminuir cantidad"
        {...rippleProps}
      >
        −
      </button>
      <span
        className="min-w-8 text-center text-[13px] tabular-nums"
        role="status"
        aria-label={`Cantidad: ${value}`}
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="ripple-host w-12 self-stretch text-text-secondary transition-colors hover:text-strong disabled:cursor-not-allowed disabled:text-line-light"
        aria-label="Aumentar cantidad"
        {...rippleProps}
      >
        +
      </button>
    </div>
  )
}
