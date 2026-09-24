# ADR 0003 — Arquitectura por capas + vertical slices

- **Estado:** Aceptada (matriz parcial: migración strangler en curso)
- **Fecha:** 2026-09-24
- **Contexto:** plan.md §3.2–§3.4

## Contexto y problema

La estructura plana original mezclaba presentación con lógica de dominio;
los mocks eran la API de los componentes y nada era testeable de forma
aislada.

## Decisión

Capas con dirección de dependencia única impuesta por convención documentada
(`docs/architecture.md` §3):

```
routes → components → features/*.api → server → domain
                                    ↘ domain ← lib
```

- `domain/`: puro, sin React/red/framework — 42 tests unitarios directos.
- `features/commerce.api.ts`: única superficie cliente↔servidor.
- El cliente **nunca** importa `@/server/**`.

## Consecuencias

- ✅ Cambiar una regla de precio/filtro/fuente de datos es un solo lugar.
- ✅ El dominio se testea sin montar React ni servidor.
- ⚠️ La matriz es manual hasta introducir `eslint-plugin-import-x`
  (no-restricted-paths); pendiente de tooling.
