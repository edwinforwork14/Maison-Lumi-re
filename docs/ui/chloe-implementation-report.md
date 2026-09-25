# Informe de implementación — Réplica UI/UX Chloé (Plan 04)

> Fecha: 25/09/2026 · Rama: `feat/ui-chloe-parity` · Referencia: `docs/ui/chloe-reference.md`
> (volcado de los §1 y §2 de `plans/04_PLAN_UI_UX_CHLOE.md`).

## 1. Fases ejecutadas

| Fase | Estado | Contenido |
|---|---|---|
| F0 Contrato | ✅ | Rama `feat/ui-chloe-parity`, línea base `npm run verify` verde, ficha de referencia versionada. Fuente: **opción B** (Jost como sustituto métrico de Futura Now, §1.6). |
| F1 Design system | ✅ | `src/styles.css` reescrito: paleta neutra de Chloé (16 tokens), escala 13 px / 23-31 px (`body-text`, `body-strong`, `editorial-title`), matriz de botones de 48 px, `field-flush`, `modal-surface`, `--ease-chloe`. `__root.tsx` sin Cormorant Garamond (sólo Jost 300/400/500). Se conservan `:focus-visible`, `prefers-reduced-motion`, `.skip-link`. |
| F2 Primitivos | ✅ | Nuevos: `ui/Icon` (set propio, trazo 1.2), `ui/Modal` (+ hook `useDialog` con el foco/trampa/Escape/inert ya probados de `Drawer`), `ui/Accordion`, `ui/Checkbox`, `ui/Radio`, `ui/Breadcrumb`, `ui/Toaster`, `ui/Carousel` (scroll-snap nativo). Reescritos: `Button` (primary/secondary/frost/ghost), `Badge`, `SectionHeading`, `QuantitySelector`, `EmptyState`, `ErrorState`. `Drawer` delega en `useDialog`. |
| F3 Chrome | ✅ | `AnnouncementBar` (rotación con fundido, umbral desde `site_settings`), `Header` con las tres zonas de la referencia (Menú/Buscar con texto+icono, wordmark centrado, wishlist y carrito con contador dentro; 3.375 rem), `MenuModal` a pantalla completa con grupos de `buildNavSections` y pie, `SearchOverlay` como modal-header, `Footer` con la estructura §2.15 (newsletter con consentimiento, socials, Tienda + 4 grupos, copyright con ubicación y moneda). El mega menú por hover desaparece (U4). |
| F4 PLP | ✅ | `PlpEditorial` (banner a sangre 4/5→16/9 + `editorial-row` con descripción a la derecha), `PlpIsland` (isla flotante con `use-hide-on-scroll`, botones frost), `PlpFilterModal` (radios de orden, acordeones `--subtle`, «Borrar todo» + «Mostrar N resultados»), `SubcategoryModal`, `ResultsCount` («Has visto N productos de N»), `ProductCard` (info debajo, cross-fade, «Añadir a la bolsa»), `ProductGrid` (2/4 columnas **sin gap**), breadcrumb al final. `validateSearch`, `loader`, `useQuery` y `setParam` intactos. |
| F5 Resto | ✅ | Home con hero a sangre 4/5→16/9 y contenido superpuesto; títulos de toda la capa de presentación en tipografía editorial sin serif; ficha con el breadcrumb movido al final; alias de color migrados en storefront + `src/components`. |
| F6 Opcionales | ⏸️ | `RecentlyViewed` y vista rápida **no implementados**: son opcionales y la vista rápida requiere aceptación explícita del propietario (el modelo no tiene endpoint y no se inventa). |
| F7 Cierre | ✅ con desviación | Ver §3. `grep` de clases antiguas fuera de `admin.*` = **0**; `npm run verify` y `npm run test:db` verdes. |

## 2. Verificación

**Suite automática** (tras `npm ci`):

- `npm run verify` → typecheck 0 errores · 81 tests unitarios · build cliente+servidor OK.
- `DATABASE_URL_TEST=… npm run test:db` → **148 tests** OK (el Plan 03 sigue intacto: la réplica no toca `domain`, `server`, `features` de datos ni tests).

**Revisión en navegador** (Playwright contra el dev server, 1440 y 375 px):

- Chrome: botones Menú/Buscar, franja de anuncios, footer NEWSLETTER; modal de menú abre y **Escape lo cierra** (estado `inert`).
- PLP: contador «Has visto N productos de N», **4 columnas en 1440** y **2 en 375**, isla «Filtrar», editorial con `h1` sin serif.
- Filtros: modal abre, orden por radio escribe `sort=price-asc` en la URL, categoría escribe `category=`, «Borrar todo» limpia y queda deshabilitado, el CTA «Mostrar N resultados» y **Escape** cierran. **Las URLs filtradas producidas son las mismas que antes del cambio** (frontera §10).
- Subcategorías y búsqueda: abren/cierran.
- F5: home (hero 16/9, 0 títulos con serif), ficha (botón añadir, breadcrumb al final antes del pie), carrito, checkout, login y wishlist cargan.
- **0 errores de consola** en todas las rutas visitadas.

**Reparación necesaria (preexistente):** `node_modules` estaba en estado mixto npm+pnpm (pnpm-lock y pnpm-workspace modificados el 25/09 a las 11:04); `node_modules/.pnpm` contenía un `start-client-core@1.170.32` incompatible que importaba `createDefaultSerovalPlugins`, rompiendo **todas las server functions en el navegador** (la PLP se quedaba en «cargando»). Aprobado por el propietario: `rm -rf node_modules && npm ci` → estado npm coherente (react-start 1.168.54 · start-client-core 1.170.30 · router-core 1.171.30) y cliente restaurado.

## 3. Desviaciones conscientes

| # | Desviación | Motivo |
|---|---|---|
| 1 | Los **alias de tokens antiguos** (`--color-ivory`, `--color-sand`, `--color-linen`, `--color-clay`, `--color-taupe`, `--color-charcoal`, `--color-ink`, `--font-serif`) se conservan en `@theme`. | El panel admin —**prohibido tocar** (§0.3)— los usa en 15 rutas (`font-serif` en 4). Eliminarlos dejaría el panel sin color. El storefront los tiene a **0** (criterio F7 cumplido en el alcance). |
| 2 | Breakpoints Tailwind (`md:768`, `lg:1024`) en vez de 767/1025 de Chloé. | Desviación prevista y sin efecto visual (§1.4). |
| 3 | Orden con **5 radios** (se añade «Nuevos») en vez de 4 de la referencia; facetas extra `tipo de producto`→categoría y `colección`. | No perder funcionalidad existente de `sort`/filtros del catálogo. |
| 4 | El pie añade el grupo **«Tienda»** con las categorías reales. | La prop `categories` del layout se conserva (frontera §7.2) y aporta enlaces vivos. |
| 5 | La tarjeta «Añadir a la bolsa» añade directamente el primer color (1 ud.) en vista rápida, sin selector de talla. | El modelo actual no expone vista rápida; no se inventa endpoint (§10.7). La disponibilidad real la valida el servidor al cotizar (D18). |
| 6 | Franja de anuncios con 2 mensajes propios; «Visto recientemente» y toasts de wishlist por acción no están conectados a eventos globales. | Contenido propio de Maison Lumière (§0.4: no se copia editorial de Chloé). |

## 4. Pendientes

- **F6 (opcional):** carrusel «Visto recientemente» y vista rápida — requieren decisión del propietario.
- **F7 parcial:** eliminar los alias de tokens cuando se acepte migrar `src/routes/admin.*` (fuera de alcance hoy).
- ~~**Fuera de este plan:** `node scripts/start.mjs` (producción) sin validar tras el `npm ci`~~ →
  **verificado el 25/09**: `npm run build` + `npm start` arrancan en :3000, las 8 rutas públicas
  (home, shop, cart, checkout, login, wishlist, robots, sitemap) responden 200, sin errores en el log,
  y Playwright confirma el cliente RPC en el build de producción (lista, modal de filtros con
  `sort=price-asc` en la URL y modal de menú). El `npm ci` reparó también el arranque de producción
  (`createRawStreamRPCPlugin` ya no falla).
- Capturas de la revisión en `/tmp/ui-chloe/` (`home-1440`, `plp-1440`, `plp-375`, `pdp-f5-1440`, `cart-f5-1440`, `checkout-f5-1440`…); regenerables con los scripts Playwright de la sesión.

## 5. Frontera intacta (Plan 04, F0–F7)

Durante las fases del Plan 04 no se ha tocado ningún archivo prohibido por §0.3:

- **Cero cambios** en `src/domain/**`, `src/server/**`, `src/data/**`, `src/lib/store.tsx`,
  `src/lib/money-format.ts`, `src/features/cart/use-cart-quote.ts`, `src/routes/admin.*`,
  `tests/**`, `drizzle/**`, `scripts/**` (el script Playwright de revisión vive fuera del repo),
  `vite.config.ts`, `tsconfig.json` y `package.json` (**cero dependencias nuevas**).
- `validateSearch`, `loader` y `useQuery` de `_storefront.shop.tsx` y los `loader` de home/ficha se
  conservan; los controles siguen escribiendo en la URL con `setParam` (las URLs filtradas producidas
  antes y después del cambio son idénticas, verificado en navegador).
- `src/features/commerce.api.ts` en esta rama contiene los cambios del **Plan 03** (cupones,
  wishlist/reseñas, `getHomepage`); la réplica del Plan 04 sólo añadió re-exports de tipos
  (`HomepageContent`) — ninguna firma congelada cambió.
- Cero `any` (typecheck en verde).

> Nota: la rama `feat/ui-chloe-parity` parte de `feature/re-estructuracion` sin commitear, así que
> `git diff` acumula los Planes 03 y 04; la frontera anterior describe lo que la réplica tocó.
