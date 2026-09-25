import { useId } from 'react'

/**
 * Checkbox de la referencia (Plan 04 §1.5): caja de 16 px, borde
 * `--line-medium`, relleno negro al marcar; label a 13 px con 24 px de
 * separación. El input nativo se conserva (teclado, formularios, a11y).
 */
export function Checkbox({
  checked,
  onChange,
  label,
  name,
  disabled = false,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  name?: string
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="flex items-center gap-3 py-2">
      <input
        id={id}
        name={name}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 shrink-0 cursor-pointer appearance-none border border-line-medium bg-surface transition-colors checked:border-strong checked:bg-strong disabled:cursor-not-allowed disabled:border-line-light"
      />
      <label htmlFor={id} className="body-text cursor-pointer text-text-primary">
        {label}
      </label>
    </div>
  )
}
