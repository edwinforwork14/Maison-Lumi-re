# ADR 0006 — Estado: Query para servidor, reducers puros para cliente, URL para filtros

- **Estado:** Aceptada
- **Fecha:** 2026-09-24
- **Contexto:** plan.md §5.4, §14.3

## Contexto y problema

Todo el estado global vivía en un único `store.tsx` (carrito + wishlist +
usuario + UI): cualquier cambio re-renderizaba todo el árbol y el usuario
residía en `localStorage` (D6).

## Decisión

| Tipo de estado | Dónde | Herramienta |
|---|---|---|
| Datos de servidor (catálogo, cotización, sesión) | caché de consultas | `@tanstack/react-query` v5 |
| Carrito, wishlist | reducers puros | `domain/cart/cart-reducer.ts` + contexto delgado |
| Filtros/orden/búsqueda | **URL** | search params de TanStack Router |
| UI efímera (drawers, menús) | estado local | `useState` |

Además, la sesión se movió al **servidor** (cookie httpOnly); el usuario ya
no se persiste en `localStorage` (D6).

## Consecuencias

- ✅ Sin dependencias de estado externas (zustand/redux descartados).
- ✅ El reducer del carrito se testea sin React (tests/cart.test.ts).
- ✅ Los filtros son compartibles y recargables (URL canónica).
- ⚠️ Persistencia del carrito aún en clave `ml.cart.v1`; migrar a `v2`
  con Zod al extraer el slice de cart (Fase 3.5).
