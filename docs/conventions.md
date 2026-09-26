# Convenciones — Maison Lumière

## Reglas de oro (plan.md §14.2)

1. **`domain` no conoce a nadie.** Si toca React, red o framework, no es dominio.
2. **El servidor decide, el cliente pinta.** Precios, stock y totales provienen de `quoteCart`/server functions; nunca se calculan en el navegador.
3. **Toda frontera se valida con Zod** (search params, formularios, server functions).
4. **Una feature, una API pública.** El import cruzado entra por `index.ts`.
5. **Sin literales de estilo repetidos**: use las `@utility` de `src/styles.css` (`eyebrow`, `btn`, `btn-outline`, `field`, `skeleton`). Plan 05 añade: `ripple-host` (contenedor del ripple en controles que no usan `.btn`) y `stagger-item` (entrada escalonada con retardo por `--i`). La onda de hover ya vive dentro de `.btn`; el color por variante se fija con `--wave-color`.
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
| `tests/*` | Unitarios de dominio con `node --test` (`pnpm test`). |

## Nomenclatura

- Archivos `kebab-case`; componentes `PascalCase.tsx`.
- Server functions: `*.server.ts` o agrupadas en `features/*.api.ts`.
- Tests: `tests/<modulo>.test.ts`.

## Contratos congelados (Plan 01 §13, consumidos por 02 y 03)

### Paginación por cursor

Implementación: `src/server/db/pagination.ts`. **No hay `offset` en listados grandes.**

| Regla | Detalle |
|---|---|
| Forma de la respuesta | `{ items: T[], nextCursor: string \| null, hasMore: boolean }` (`Page<T>`) |
| Cursor | Opaco: base64url de `{ k, id }`. `k` es la clave de orden de la última fila, `id` el desempate |
| Lectura | `decodeCursor()` devuelve `null` ante cualquier cursor corrupto o manipulado ⇒ se empieza por el principio, nunca se lanza |
| Tamaño | `clampPageSize()`: por defecto 20, máximo 100; el valor del cliente **siempre** se normaliza en servidor |
| Consulta | Se piden `size + 1` filas para calcular `hasMore` sin una consulta de conteo |
| Orden | Estable y determinista (clave + id): una fila insertada durante la paginación no desplaza la ventana |

### Política de errores

Implementación: `src/server/errors.ts` (`AppError` + `ErrorCode`). Los fallos esperados viajan con
código; los de programación se normalizan a `INTERNAL` sin exponer detalles internos.

| Código | Cuándo | HTTP equivalente |
|---|---|---|
| `VALIDATION` | Falla la validación Zod en cualquier frontera | 400 |
| `UNAUTHENTICATED` | Sin sesión o sesión expirada | 401 |
| `FORBIDDEN` | Sesión válida sin el permiso requerido (`requirePermission`) | 403 |
| `NOT_FOUND` | El recurso no existe (o no pertenece al titular: nunca se filtra existencia ajena) | 404 |
| `CONFLICT` | Violación de unicidad o de regla de negocio (SKU duplicado, slug duplicado, stock insuficiente, reembolso superior a lo cobrado, edición optimista obsoleta) | 409 |
| `OUT_OF_STOCK` | La reserva no se pudo confirmar (también se usa como `CONFLICT` en checkout) | 409 |
| `PAYMENT_DECLINED` | La pasarela rechaza el cargo | 402 |
| `RATE_LIMITED` | Límite de intentos agotado (p. ej. login admin) | 429 |
| `CONFIG` | Entorno mal configurado (falta `DATABASE_URL`, `SESSION_SECRET`) | 500 |
| `INTERNAL` | Fallo no previsto; mensaje genérico, detalle sólo en el log con `request_id` | 500 |

Reglas: el servidor decide y **nunca** filtra detalles internos en el mensaje; la UI pinta un estado
de error con reintento. Ninguna server function devuelve un stack trace ni una fila cruda de BD.

### Contrato de invalidación de caché (Plan 02 §4 → Plan 03 §9)

Claves centralizadas en **`src/features/model/queries.ts`** (`queryKeys`). El storefront sólo usa
claves de ese módulo; cada mutación del panel declara qué clave invalida (match por prefijo, así
`queryKeys.products()` invalida todas las variantes con filtros).

| Clave | Quién la consulta | `staleTime` | La invalida |
|---|---|---|---|
| `products` (+ filtros de la URL) | shop (`_storefront.shop.tsx`) | 60 s (global) | Publicar/archivar/editar producto, ajustar stock (`admin.products.*`, `admin.inventory`) |
| `related` (slug) | ficha de producto | 60 s (global) | — (se refresca al navegar) |
| `site-settings` | checkout, ficha de producto | 5 min | `admin.settings` (`adminUpdateSetting`) |
| `cart-quote` (líneas, método, cupón) | drawer, carrito, checkout | 30 s | — (el servidor es la verdad; nunca se cachea un cupón rechazado) |
| `my-orders` | cuenta del cliente | 60 s (global) | — (sólo el servidor la llena, desde la sesión) |
| `session` / `wishlist` | hook de wishlist | 60 s / 30 s | toggle de wishlist (`onSettled`) |
| `wishlist-products` (ids) | página de wishlist | 60 s (global) | — |
| `content` | portada | — | `admin.content` (`adminUpsertHomepageSection`/`adminUpsertBanner`) |
| `admin.*` | el panel | 60 s (global) | cada mutación del panel, por dominio |

Además, la **portada y el SEO no dependen de esta caché**: `getHomepage`, `listProducts` (loader de
la home y de la shop) y `/api/sitemap.xml` se ejecutan en el servidor en cada navegación, así que un
cambio publicado en el panel se ve sin esperar a ningún `staleTime`.

## Comandos

> **Gestor de paquetes: `pnpm` (único).** `package-lock.json` se eliminó y está en `.gitignore`:
> mezclar npm y pnpm en `node_modules` rompe el cliente (el navegador resuelve módulos de árboles
> distintos y las server functions fallan).

```bash
pnpm verify      # typecheck + tests + build
pnpm dev         # desarrollo
pnpm build && pnpm start   # producción (scripts/start.mjs, puerto 3000)
```

## Defectos corregidos (trazabilidad con plan.md §10)

D1 mega menú · D2 `npm start` · D3 doble orden · D5 totales · D6 sesión · D7 pedidos en servidor · D8 enlaces tipados · D9 diálogos accesibles · D10 utilidades de estilo · D14 variantes/SKU · D17 dinero/format · D18 stock en cantidad · D19 skeletons.
