import { useId, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

export interface AccordionItem {
  readonly id: string
  readonly label: string
  readonly content: ReactNode
}

/**
 * Acordeón de filtros (Plan 04 §1.5 y §2.9): acordeón `--subtle`, trigger
 * abierto a peso 500, transición `all .4s var(--ease-chloe)` y semántica
 * completa (`aria-expanded`, `aria-controls`, `role="region"`).
 *
 * La primera faceta empieza abierta por defecto; el resto, cerradas.
 */
export function Accordion({
  items,
  defaultOpenId,
}: {
  items: readonly AccordionItem[]
  defaultOpenId?: string
}) {
  const baseId = useId()
  const [openId, setOpenId] = useState<string | null>(defaultOpenId ?? items[0]?.id ?? null)

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const open = openId === item.id
        const regionId = `${baseId}-${item.id}`
        return (
          <li key={item.id} className="overflow-hidden rounded-[4px] bg-subtle">
            <h3>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={regionId}
                onClick={() => setOpenId(open ? null : item.id)}
                className={`flex w-full items-center justify-between gap-3 px-5 py-3 text-left text-[13px] leading-[1.3846] transition-colors ${
                  open ? 'font-medium' : 'font-normal'
                }`}
              >
                {/* En la referencia las etiquetas van en minúsculas en el DOM
                    y CSS las capitaliza: aquí se pinta ya capitalizada. */}
                <span className="capitalize">{item.label}</span>
                <Icon
                  name="chevron-down"
                  size={16}
                  className={`shrink-0 text-text-secondary transition-transform duration-300 ${
                    open ? 'rotate-180' : ''
                  }`}
                />
              </button>
            </h3>
            <div
              id={regionId}
              role="region"
              aria-label={item.label}
              className={`grid transition-all duration-[400ms] ease-[cubic-bezier(.23,1,.32,1)] ${
                open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
              }`}
            >
              <div className="overflow-hidden">
                <div className="px-5 pb-5 pt-0">{item.content}</div>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
