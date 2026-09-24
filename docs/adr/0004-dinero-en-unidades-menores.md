# ADR 0004 — Dinero en unidades menores y servidor como autoridad

- **Estado:** Aceptada
- **Fecha:** 2026-09-24
- **Contexto:** plan.md §4.5, defectos D5 y D17

## Contexto y problema

Los precios eran `number` en euros (float) y existían dos fuentes de verdad
para el total: el store del cliente (envío estándar fijo) y el checkout
(método elegido). El navegador decidía precios y totales.

## Decisión

1. `domain/money` modela importes como **enteros en céntimos** + `Currency`,
   con aritmética sin pérdida (`add`, `allocate`, `percentage`).
2. La cotización es **exclusiva del servidor**: `quoteCart` re-cotiza líneas
   y envío; el cliente solo pinta el `CartQuote` resultante.
3. `placeOrder` **re-cotiza en servidor** y nunca confía en totales del
   cliente.

## Consecuencias

- ✅ Un solo total en drawer, carrito y checkout (D5 verificado por tests).
- ✅ Multidivisa preparada (`Currency` ya es un parámetro).
- ⚠️ Mientras dura la strangler, las semillas siguen en euros decimales;
  la conversión se centraliza en `lib/money-format.ts` para el formateo.
