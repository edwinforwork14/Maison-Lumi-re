# ADR 0007 — Design system con tokens CSS y `@utility` de Tailwind 4

- **Estado:** Aceptada
- **Fecha:** 2026-09-24
- **Contexto:** plan.md §5.5, defectos D1 y D10

## Contexto y problema

La cadena `text-[11px] uppercase tracking-[0.25em] text-taupe` estaba
duplicada en 12+ archivos, y el mega menú dependía de una variante
`group-nav:` que no existía (nunca se veía).

## Decisión

1. Tokens de marca en `@theme` (`src/styles.css`): colores originales
   conservados (ivory…gold) + animaciones.
2. Utilidades semánticas con `@utility`: `eyebrow`, `btn`, `btn-outline`,
   `field`, `skeleton`.
3. `@custom-variant group-nav` con `:focus-within` para apertura por
   hover **y teclado**.
4. Sin librerías de clases (clsx/cva): `cn()` de 5 líneas en `lib/cn.ts`.

## Consecuencias

- ✅ Un cambio de estilo de marca es un cambio de token, no una búsqueda
  global (D10).
- ✅ Mega menú visible y operable por teclado (D1).
- ✅ El look "lujo silencioso" del brief permanece intacto.
- ⚠️ Fase 3.5 debe completar el reemplazo de las cadenas crudas restantes
  por las utilidades en componentes aún migrados parcialmente.
