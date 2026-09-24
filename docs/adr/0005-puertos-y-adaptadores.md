# ADR 0005 — Puertos y adaptadores; in-memory primero

- **Estado:** Aceptada
- **Fecha:** 2026-09-24
- **Contexto:** plan.md §4.4, §14.3

## Contexto y problema

Había que avanzar sin decidir base de datos, pasarela de pagos ni CMS, pero
sin construir una arquitectura que obligara a reescribir al conectarlos.

## Decisión

Los accesos externos se definen como **puertos** (interfaces) con
**adaptadores** intercambiables; el adaptador actual es in-memory:

| Puerto | Adaptador Fase 1–4 | Adaptador futuro |
|---|---|---|
| CatalogRepository | `server/seed/catalog.ts` (in-memory) | postgres / medusa / shopify |
| OrderRepository | Map in-memory en `services/commerce.ts` | postgres (Drizzle) |
| CustomerRepository | `server/session/store.ts` (in-memory) | postgres |
| PaymentGateway | simulado dentro de placeOrder | stripe |
| PasswordHasher | dev (base64, documentado como tal) | argon2 / scrypt |

## Consecuencias

- ✅ Cambiar de fuente de datos toca un solo archivo por puerto.
- ✅ Los tests de dominio no requieren red ni DB.
- ⚠️ Los pedidos/cuentas viven mientras el proceso vive (aceptado en
  plan.md §12.2.9 y runbook §5.4).
- ⚠️ El hasher de desarrollo NO es seguro para producción: bloqueante para
  activar registros reales.
