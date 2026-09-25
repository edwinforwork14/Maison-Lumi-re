# ADR 0009 — PostgreSQL 16 + Drizzle ORM

- **Estado:** Aceptada
- **Fecha:** 2026-09-25
- **Contexto:** `plans/01_PLAN_BASE_DE_DATOS_ECOMMERCE.md` §3, §7 y §13; complementa el ADR 0005

## Contexto y problema

El ADR 0005 dejó los puertos definidos con un adaptador in-memory. Eso fue
correcto para avanzar sin decidir base de datos, pero acumulaba defectos
verificables: pedidos, cuentas y sesiones en `Map` se perdían al reiniciar
(D23), el stock nunca se descontaba al vender (D25) y no había transacciones
ni concurrencia (D26). Sin motor decidido no existían ni migraciones ni
constraints, y cada invariant del plan 01 (§5) era imposible de hacer cumplir
a la base.

## Decisión

**PostgreSQL 16 + Drizzle ORM (`drizzle-orm`) con el driver `postgres`
(postgres.js) y `drizzle-kit` para el ciclo de migración.**

| Aspecto | Decisión |
|---|---|
| Motor | PostgreSQL 16 (contenedor `ml-postgres` en local y en CI) |
| ORM | Drizzle ORM `^0.45` — tipos derivados del esquema, sin codegen |
| Driver | `postgres` `^3.4` (postgres.js), con pool gestionado en `src/server/db/client.ts` |
| Migraciones | `drizzle-kit generate` → SQL versionado en `drizzle/`; `drizzle-kit migrate` para aplicarlas |
| Política | **Forward-only**: expand → backfill → contract; los backfills van en ficheros aparte |
| Esquema | `src/server/db/schema/*.ts` (un fichero por dominio), exportado por `index.ts` |
| Elección de adaptador | `src/server/runtime/container.ts`, guiada por `DATA_SOURCE` (`in-memory` \| `postgres`) |
| Relación con ADR 0005 | **Lo implementa, no lo contradice**: `*.port.ts` sigue siendo el contrato; este ADR decide *cuál* es el adaptador de producción |

## Consecuencias

- ✅ Los invariantes duros del plan 01 (§5) pasan de ser promesas de servicio a
  `CHECK`, `UNIQUE` e índices: un total descuadrado, un SKU duplicado o un
  stock negativo **no se pueden insertar**.
- ✅ Transacciones, `SELECT … FOR UPDATE` y claves de idempotencia reales: la
  sobreventa queda cerrada con test (`tests/db/checkout.test.ts`).
- ✅ Los tests de dominio siguen corriendo sin base de datos: el adaptador
  in-memory se conserva para `DATA_SOURCE=in-memory`.
- ⚠️ Aparece una responsabilidad nueva: revisar el SQL que genera
  `drizzle-kit generate` en cada PR y no editar a mano migraciones ya aplicadas.
- ⚠️ `DATA_SOURCE=postgres` exige `DATABASE_URL` y `SESSION_SECRET`; la
  validación está en `src/server/runtime/env.ts` y falla al arrancar, no en
  caliente.
