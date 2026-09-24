# ADR 0001 — Un solo árbol `src/` con backend embebido

- **Estado:** Aceptada
- **Fecha:** 2026-09-24
- **Contexto:** plan.md §3.1 y §14.3

## Contexto y problema

El encargo exige frontend y backend en un único árbol de código. Había que
decidir si crear `frontend/` + `backend/` separados (o monorepo) o embeber
el backend en la app del framework.

## Decisión

Backend expresado como **server functions** (`createServerFn`) en
`src/features/commerce.api.ts` + infraestructura en `src/server/**`
(seed, servicios, sesión, errores, logger). Sin carpeta `backend/`.

## Consecuencias

- ✅ Tipado de extremo a extremo con una sola toolchain y un solo build.
- ✅ SSR y RPC comparten módulos de dominio sin duplicación.
- ⚠️ La frontera cliente/servidor es convención (reglas §3.3) — se mitiga
  con revisión de bundle y, en el futuro, ESLint de fronteras.
- Alternativas descartadas: monorepo con workspaces (coste sin segundo
  consumidor), backend independiente (duplicaría tipos y despliegues).
