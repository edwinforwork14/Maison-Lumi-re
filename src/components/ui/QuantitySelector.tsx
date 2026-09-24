interface QuantitySelectorProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
}

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
        className="px-4 py-2 text-taupe transition-colors hover:text-ink"
        aria-label="Disminuir cantidad"
      >
        −
      </button>
      <span className="min-w-8 text-center text-sm tabular-nums">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        className="px-4 py-2 text-taupe transition-colors hover:text-ink"
        aria-label="Aumentar cantidad"
      >
        +
      </button>
    </div>
  )
}
