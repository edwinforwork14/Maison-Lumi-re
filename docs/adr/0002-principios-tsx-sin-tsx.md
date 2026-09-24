# ADR 0002 — Adopción de los principios de TSDX sin la herramienta

- **Estado:** Aceptada
- **Fecha:** 2026-09-24
- **Contexto:** plan.md §2

## Contexto y problema

El brief original mencionaba TSDX como referencia de organización.
TSDX está sin mantenimiento activo (evidencia: marigold#1661, Sui migrando
a tsup/vitest) y está pensado para **librerías**, no para aplicaciones.

## Decisión

Adoptar sus **principios de organización** y sustituir su stack:

| Principio TSDX | Equivalente moderno aquí |
|---|---|
| Entrada única por módulo | `domain/*/index.ts`, API pública única |
| Alias de paths | `@/domain`, `@/server`, `@/features`… en tsconfig |
| Configuración raíz delgada | Un `vite.config.ts`, un `tsconfig.json` |
| Baterías incluidas | Vite (build), node:test (unit), Prettier |

## Consecuencias

- ✅ Estructura "monorepo-ready" sin coste de monorepo (playbook en ADR 0009
  / plan §3.5, se ejecutará solo con un segundo consumidor).
- ✅ Sin dependencias muertas ni CLI sin mantenimiento.
- ⚠️ tsup solo se añadirá si se publica algún paquete npm.
