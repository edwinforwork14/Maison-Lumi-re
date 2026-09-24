# Convenciones — Maison Lumière

## Reglas de oro (plan.md §14.2)

1. **`domain` no conoce a nadie.** Si toca React, red o framework, no es dominio.
2. **El servidor decide, el cliente pinta.** Precios, stock y totales provienen de `quoteCart`/server functions; nunca se calculan en el navegador.
3. **Toda frontera se valida con Zod** (search params, formularios, server functions).
4. **Una feature, una API pública.** El import cruzado entra por `index.ts`.
5. **Sin literales de estilo repetidos**: use las `@utility` de `src/styles.css` (`eyebrow`, `btn`, `btn-outline`, `field`, `skeleton`).
6. **Prohibido `any`, `as never` y enlaces sin tipos** (`ButtonLink` con `to` tipado; nunca `to="/x?query=..."`).

## Estructura

| Carpeta | Contenido |
|---|---|
| `src/domain/*` | Núcleo puro: money, catalog, pricing, cart, order. Sin React ni red. |
| `src/server/*` | Backend: seed, servicios, sesión, errores, logger. **Nunca** importable desde componentes cliente. |
| `src/features/commerce.api.ts` | Única superficie cliente↔servidor (server functions con Zod). |
| `src/components/ui/*` | Primitivos sin dominio (Button, ButtonLink, Drawer, Badge…). |
| `src/components/{layout,product,cart}/*` | Componentes de negocio. |
| `src/routes/*` | Solo routing y composición; loader + estados (pending/error/404). |
| `tests/*` | Unitarios de dominio con `node --test` (`npm test`). |

## Nomenclatura

- Archivos `kebab-case`; componentes `PascalCase.tsx`.
- Server functions: `*.server.ts` o agrupadas en `features/*.api.ts`.
- Tests: `tests/<modulo>.test.ts`.

## Comandos

```bash
npm run verify      # typecheck + tests + build
npm run dev         # desarrollo
npm run build && npm start   # producción (scripts/start.mjs, puerto 3000)
```

## Defectos corregidos (trazabilidad con plan.md §10)

D1 mega menú · D2 `npm start` · D3 doble orden · D5 totales · D6 sesión · D7 pedidos en servidor · D8 enlaces tipados · D9 diálogos accesibles · D10 utilidades de estilo · D14 variantes/SKU · D17 dinero/format · D18 stock en cantidad · D19 skeletons.
