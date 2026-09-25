# Maison Lumière

E-commerce premium construido con **TanStack Start + React 19 + TypeScript + Tailwind 4**, reestructurado según `plan.md` (arquitectura por capas + vertical slices, backend en el mismo árbol).

## Arranque

> **Gestor de paquetes: `pnpm` (único).** El proyecto usa `pnpm-lock.yaml`; `package-lock.json`
> fue eliminado porque mezclar npm y pnpm en `node_modules` rompe el cliente (resuelve
> `start-client-core` y `router-core` de árboles distintos y las server functions fallan en el navegador).

```bash
pnpm install
pnpm dev          # desarrollo en http://localhost:3000
pnpm verify       # typecheck + tests + build
pnpm build && pnpm start   # producción (SSR)
```

Cuenta demo: `demo@maisonlumiere.es` / `demo1234`

## Arquitectura

```
src/
├─ domain/     # núcleo puro: money, catalog, pricing, cart, order (testeable sin framework)
├─ server/     # backend: seed con variantes/SKU, servicios (quoteCart, placeOrder), sesión, errores, logger
├─ features/   # server functions (superficie cliente↔servidor, validada con Zod)
├─ components/ # ui/ (primitivos) + layout/product/cart (negocio)
├─ routes/     # TanStack Router: loaders SSR, pending/error/404, search params
└─ lib/        # utilidades transversales (money-format, storage, result, cn)
```

Principios: **el servidor decide, el cliente pinta** (precios, stock y totales viajan en la cotización de `quoteCart`); **`domain` no conoce a nadie**; toda frontera se valida con Zod. Detalle en `docs/conventions.md` y `plan.md`.

## Tests

```bash
pnpm test    # unitarios de dominio con node:test (money, cart, order, catalog, pricing, seeds)
```
