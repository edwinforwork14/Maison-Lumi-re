import { useId } from 'react'

/**
 * Radio de la referencia (Plan 04 §1.5 y §2.9): círculo de 16 px, borde
 * `--line-medium`, relleno negro al marcar; label a 13 px con 24 px de
 * separación. El input nativo se conserva (teclado, formularios, a11y).
 */
export function Radio({
  checked,
  onChange,
  label,
  name,
}: {
  checked: boolean
  onChange: () => void
  label: string
  name: string
}) {
  const id = useId()
  return (
    <div className="flex items-center gap-3 py-2">
      <input
        id={id}
        name={name}
        type="radio"
        checked={checked}
        onChange={onChange}
        className="size-4 shrink-0 cursor-pointer appearance-none rounded-full border border-line-medium bg-surface transition-colors checked:border-strong checked:bg-strong"
      />
      <label htmlFor={id} className="body-text cursor-pointer text-text-primary">
        {label}
      </label>
    </div>
  )
}
