interface QuantitySelectorProps {
  value: number
  onChange: (value: number) => void
  min?: number
  /** Máximo disponible: por defecto respeta el stock real (defecto D18). */
  max?: number
}

/**
 * Stepper de cantidad accesible: los botones se desactivan en los límites
 * y el valor se anuncia a lectores de pantalla.
 */
export function QuantitySelector({
  value,
  onChange,
  min = 1,
  max = 10,
}: QuantitySelectorProps) {
  return (
    <div className="inline-flex items-center border border-linen">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="px-4 py-2 text-taupe transition-colors hover:text-ink disabled:cursor-not-allowed disabled:text-linen"
        aria-label="Disminuir cantidad"
      >
        −
      </button>
      <span
        className="min-w-8 text-center text-sm tabular-nums"
        role="status"
        aria-label={`Cantidad: ${value}`}
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="px-4 py-2 text-taupe transition-colors hover:text-ink disabled:cursor-not-allowed disabled:text-linen"
        aria-label="Aumentar cantidad"
      >
        +
      </button>
    </div>
  )
}
