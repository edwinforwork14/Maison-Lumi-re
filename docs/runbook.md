# Runbook — Maison Lumière

> Procedimientos operativos para desplegar, diagnosticar y revertir la
> aplicación. Complemento de `docs/architecture.md`.

## 1. Requisitos

| Requisito | Valor |
|---|---|
| Node | ≥ 24 (usado en desarrollo: v24.14.0) |
| npm | ≥ 11 |
| Puertos | 3000 (producción), 5173/vite (desarrollo) |

## 2. Variables de entorno

Actualmente la aplicación no requiere variables obligatorias (el adaptador
in-memory no necesita secretos). Cuando se active la sesión firmada o una
base de datos real, `.env` se validará en el arranque (plan.md §4.10):

```dotenv
# Futuras (Fase 5+ / persistencia real)
DATA_SOURCE=in-memory        # in-memory | postgres
PUBLIC_SITE_URL=http://localhost:3000
SESSION_SECRET=cambiar-32chars-minimo
PAYMENTS_PROVIDER=fake       # fake | stripe
```

Regla: los secretos jamás llegan al bundle cliente; verificar con
`grep -r SESSION_SECRET dist/client/` (debe devolver 0 coincidencias).

## 3. Comandos operativos

```bash
npm ci                 # instalación limpia (CI/producción)
npm run verify         # typecheck + tests + build  (gate obligatorio)
npm run build          # genera dist/client/ y dist/server/server.js
npm start              # sirve producción en :3000 (scripts/start.mjs)
npm run dev            # desarrollo
npm test               # 42 unitarios de dominio (node:test)
```

### Comprobación post-despliegue (smoke test)

```bash
for url in "/" "/shop" "/products/aurora-frame" "/cart" "/checkout"; do
  printf "%-28s %s\n" "$url" "$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000$url")"
done
# Esperado: 200 en todas
```

Verificación de SSR con datos: `curl -s http://localhost:3000/shop | grep -c "Aurora Frame"`
debe devolver ≥ 1.

## 4. Arquitectura de despliegue

- El build genera un handler WinterCG (`dist/server/server.js` con `fetch`).
- `scripts/start.mjs` lo envuelve en `node:http` y expone el puerto 3000
  (variable `PORT`, host `0.0.0.0`).
- En entornos serverless el mismo `server.default.fetch` puede montarse en
  Vercel/Netlify sin el wrapper Node.

## 5. Incidentes

### 5.1 Síntoma: la app responde 000 / conexión rechazada

1. `npm run build && npm start` de nuevo; revisar que el log muestre
   `Maison Lumière → http://0.0.0.0:3000`.
2. En Windows, comprobar que no queda un proceso Node colgado del test
   anterior (`taskkill //F //IM node.exe` con precaución).

### 5.2 Síntoma: una ruta devuelve 500

1. Reproducir con `curl` y anotar el stack del log estructurado
   (JSON con `level: error`).
2. Consultar el último commit que tocó la ruta (`git log -p src/routes/<ruta>`).
3. Los fallos esperados NO llegan como 500: viajan como `AppError` con
   código (`OUT_OF_STOCK`, `VALIDATION`…). Un 500 es siempre un bug.

### 5.3 Síntoma: totales inconsistentes entre carrito y checkout

No debería ocurrir (defecto D5 resuelto: única fuente en `quoteCart`).
Si reaparece, buscar cualquier cálculo de totales fuera de
`src/server/services/commerce.ts`:
`grep -rn "shippingCostFor\|subtotal +" src/routes src/components`
solo debe mostrar formateo, no aritmética.

### 5.4 Síntoma: pedidos perdidos al reiniciar

Esperado con el adaptador in-memory: los pedidos viven mientras el proceso
vive (alcance declarado en plan.md §12.2.9). Si se requiere persistencia,
activar el adaptador postgres del puerto `OrderRepository`.

## 6. Rollback

1. `git log --oneline -10` para identificar el último commit sano.
2. Desplegar de nuevo desde ese commit:
   ```bash
   git checkout <commit-sano>
   npm ci && npm run build && npm start
   ```
3. Verificar con el smoke test de §3.
4. Registrar el incidente y la causa raíz en el PR de hotfix.

## 7. Salud y observabilidad

- Log estructurado en stdout (`src/server/logger.ts`): `{ts, level, event,
  route, durationMs}` — sin PII ni datos de pago.
- Evento clave: `order.placed` (cada pedido confirmado).
- Punto de extensión para `/api/health` y trazas: `server/runtime/`
  (pendiente en Fase 3.5, ver architecture.md §8).

## 8. Cambios de datos

Las semillas viven en `src/data/*` (legacy) y `src/server/seed/catalog.ts`
(normalizadas). Añadir un producto:

1. Añadir la semilla en `src/data/products.ts` (nombre, slug, precio, colores,
   stock, materiales, colección, categoría).
2. Las variantes/SKU se generan automáticamente en `server/seed/catalog.ts`.
3. Ejecutar `npm test`: los tests de caracterización validan los invariantes
   (28 productos hoy; actualizar los conteos si cambia el catálogo).
4. `npm run verify` y PR.
