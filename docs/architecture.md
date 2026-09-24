# Arquitectura — Maison Lumière

> Fuente de verdad de la estructura. Cualquier cambio aquí descrito debe
> registrarse como ADR en `docs/adr/` y actualizar este documento en el
> mismo PR.

## 1. Visión general

Aplicación full-stack **TanStack Start + React 19 + TypeScript + Tailwind 4**
con backend y frontend en **un único árbol `src/`**. No hay carpeta `backend/`:
el servidor son las server functions (`createServerFn`), los servicios en
`src/server/**` y la sesión en cookie httpOnly.

Principios (plan.md §14.2):

1. `domain` no conoce a nadie (sin React, sin red, sin framework).
2. El servidor decide, el cliente pinta (precios, stock y totales).
3. Toda frontera se valida con Zod.
4. Cada módulo es un paquete en potencia (API pública única).

## 2. Árbol actual

```
src/
├─ domain/                 # NÚCLEO PURO — testeable sin framework
│  ├─ money/               #   Money en céntimos + aritmética
│  ├─ catalog/             #   filtrado/ordenado (una sola pasada, D3)
│  ├─ pricing/             #   umbral envío gratuito, coste por método
│  ├─ cart/                #   reducer puro + selectores
│  └─ order/               #   entidad, estados, transiciones válidas
├─ server/                 # BACKEND (nunca importable desde cliente)
│  ├─ seed/catalog.ts      #   semillas normalizadas: variantes/SKU/stock (D14/D15)
│  ├─ services/commerce.ts #   quoteCart autoritativa (D5) + placeOrder idempotente (D7)
│  ├─ session/store.ts     #   cookie httpOnly, cuentas in-memory (D6)
│  ├─ errors.ts            #   AppError con códigos tipados
│  └─ logger.ts            #   log estructurado sin PII
├─ features/
│  └─ commerce.api.ts      # server functions: única superficie cliente↔servidor
├─ components/
│  ├─ ui/                  # primitivos (Button, ButtonLink, Drawer, Badge…)
│  ├─ layout/              # Header, MegaMenu, MobileMenu, SearchOverlay
│  ├─ product/             # ProductCard, ProductGrid
│  └─ cart/                # CartDrawer, CartSummary
├─ routes/                 # 9 rutas TanStack Router (loaders SSR, skeletons)
├─ lib/                    # money-format, storage, result, cn, format (compat)
├─ data/                   # semillas legacy (migración strangler en curso)
└─ tests/ (../tests)       # 42 tests unitarios con node:test
```

## 3. Matriz de dependencias (regla dura)

| Desde ↓ / Puede importar → | `lib` | `domain` | `features/*.api` | `server` | `data` | `components` |
|---|---|---|---|---|---|---|
| `routes/**` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| `components/**` | ✅ | ✅ | ✅ | ❌ | ⚠️ legacy¹ | ✅ |
| `features/*.api.ts` | ✅ | ✅ | — | ✅ | ✅ | ❌ |
| `domain/**` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `lib/**` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `server/**` | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |

¹ `data/` es legacy de la migración strangler: solo `data/shipping.ts`,
`data/categories.ts` y `data/collections.ts` alimentan al servidor; la UI ya
no los importa (salvo tipos compartidos en `data/types.ts` hasta Fase 3.5).

**Regla mnemotécnica:** `domain` no conoce a nadie · el cliente **nunca**
importa `@/server/**` · los componentes consumen solo `features/commerce.api.ts`.

## 4. Flujo de datos del dinero (defecto D5, resuelto)

```
Cliente                          Servidor
───────                          ────────
cart local (localStorage) ──┐
                            ├─► quoteCart({lines, method}) ──► CartQuote
filtro UI                   │      (re-cotiza, valida stock)     │
                            └─► placeOrder({...})                ▼
                                (idempotencyKey)          subtotal/shipping/total
                                                          ──► el cliente PINTA
```

Ningún componente calcula un total: `formatPrice` solo formatea lo que el
servidor envió.

## 5. Inventario por variante (D14)

- Cada producto tiene `variants[]` con `sku` y `stock` propio.
- El stock del producto es un **agregado derivado** de sus variantes.
- `placeOrder` rechaza pedidos con variantes agotadas (`AppError('OUT_OF_STOCK')`).

## 6. Idempotencia de pedidos (D7)

- Cada intento de checkout genera `idempotencyKey` (UUID) ligado al contenido
  del carrito; reenvíos con la misma clave devuelven el pedido original.
- Los pedidos viven en un Map in-memory (adaptador `OrderRepository` in-memory);
  el puerto está listo para Postgres/Drizzle sin tocar servicios ni UI.

## 7. Errores (§4.9 del plan)

- **Esperados**: `AppError` con `ErrorCode` (VALIDATION, OUT_OF_STOCK,
  UNAUTHENTICATED…); la UI muestra mensaje premium.
- **De programación**: excepción → log estructurado → error boundary de ruta.

## 8. Migración strangler pendiente (Fase 3.5)

| Pieza legacy | Destino definitivo |
|---|---|
| `src/data/types.ts` | `src/domain/*/types.ts` + schemas Zod |
| `src/data/{products,categories,collections}.ts` | `src/server/seed/*` |
| `src/data/shipping.ts` | `src/server/seed/shipping-options.ts` |
| `src/lib/store.tsx` | `features/cart` + `features/wishlist` slices |
| `src/components/**` | `src/features/{slice}/components` + `src/ui` |

Criterio: nada se borra hasta que su reemplazo esté probado y las 9 rutas
sigan en verde (`npm run verify`).

## 9. Roadmap de fronteras futuras

- **Persistencia real**: puerto `OrderRepository` → adaptador `postgres/`
  (Drizzle). Solo cambia `server/services/commerce.ts` si se extrae a container.
- **Pagos reales**: puerto `PaymentGateway` (hoy simulado dentro de placeOrder)
  → adaptador `stripe/` con webhook.
- **i18n/multidivisa**: `lib/money-format.ts` es el único punto de locale;
  `domain/money` ya soporta `Currency` distinta de EUR.
- **Monorepo**: ver `docs/adr/0002-monorepo-ready.md` (playbook, no ejecutado).
