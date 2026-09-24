# PLAN DE REESTRUCTURACIÓN — `jesus ecomerce` (Maison Lumière)

**Documento para:** equipo de TI / ingeniería
**Objeto:** convertir el proyecto actual en un e-commerce premium, escalable, legible y mantenible, con **frontend y backend en un único árbol de código**.
**Estado del documento:** propuesta de ejecución por fases, lista para implementarse.
**Base:** inspección real del repositorio (37 archivos en `src/`, sin `node_modules`) + investigación de las convenciones de TSDX y de las APIs realmente disponibles en los paquetes instalados.

---

## Índice

0. [Resumen ejecutivo, alcance y asunciones](#0-resumen-ejecutivo-alcance-y-asunciones)
1. [Diagnóstico del estado actual](#1-diagnóstico-del-estado-actual)
2. [Investigación TSDX: qué se adopta y qué no](#2-investigación-tsdx-qué-se-adopta-y-qué-no)
3. [Arquitectura objetivo](#3-arquitectura-objetivo)
4. [Backend en el mismo árbol](#4-backend-en-el-mismo-árbol)
5. [Frontend, estado y design system](#5-frontend-estado-y-design-system)
6. [Modelo de dominio premium](#6-modelo-de-dominio-premium)
7. [Tooling, calidad y CI](#7-tooling-calidad-y-ci)
8. [Mapeo archivo por archivo](#8-mapeo-archivo-por-archivo)
9. [Plan por fases](#9-plan-por-fases)
10. [Registro de defectos a corregir](#10-registro-de-defectos-a-corregir)
11. [Riesgos y mitigaciones](#11-riesgos-y-mitigaciones)
12. [Definition of Done y criterios de aceptación](#12-definition-of-done-y-criterios-de-aceptación)
13. [Anexos](#13-anexos)
14. [Checklist de PR y reglas de oro](#14-checklist-de-pr-y-reglas-de-oro)

---

## 0. Resumen ejecutivo, alcance y asunciones

### 0.1 Resumen

El proyecto es una aplicación **TanStack Start + React 19 + TypeScript + Tailwind 4 + Vite 7** con 9 rutas funcionales, 28 productos mock y un embudo de compra que hoy funciona enteramente en el cliente. El código está bien escrito en lo visual, pero su arquitectura es **plana y sin fronteras**: los datos mock se importan directamente desde componentes, todo el estado global vive en un único `src/lib/store.tsx`, los precios se calculan en el navegador con dos fuentes de verdad distintas, no existe backend, no existe control de versiones y no hay ninguna prueba automatizada.

Este plan reestructura el proyecto a una arquitectura **por capas + vertical slices** dentro de **un solo árbol `src/`**, con el backend expresado como *server functions* y *server routes* del propio framework (nada de una carpeta `backend/` aparte), y adopta los principios de TSDX (configuración raíz delgada, módulos con API pública única, alias de paths, "cada módulo es un paquete en potencia") sustituyendo su stack ya sin mantenimiento por los equivalentes actuales.

El resultado esperado es un proyecto donde:

- cambiar una regla de precio, un filtro o una fuente de datos se hace **en un solo lugar**;
- añadir una categoría, un idioma, un método de envío o una pasarela de pago **no obliga a tocar componentes**;
- el navegador **nunca decide** precios, stock ni totales;
- cualquier ingeniero nuevo entiende la estructura en menos de una hora porque las fronteras están **impuestas por herramienta** (ESLint + TypeScript + build), no por buena voluntad.

### 0.2 Alcance

**Dentro del alcance:**

- Reestructuración completa de carpetas y capas de `src/`.
- Backend dentro del mismo árbol: server functions, repositorios, servicios, sesión, pedidos, cotización de carrito.
- Migración de los datos mock a semillas normalizadas accesibles solo desde el servidor.
- Nuevo modelo de dominio (variantes/SKU, dinero en unidades menores, categorías en árbol).
- Design system real, accesibilidad, estados de carga/vacío/error, i18n-ready, SEO completo.
- Tooling: git, ESLint, Prettier, Vitest, Playwright, CI, scripts de `package.json`.
- Documentación: `docs/architecture.md`, `docs/conventions.md`, `docs/runbook.md`, ADRs.

**Fuera del alcance de este documento (fases posteriores explícitas):**

- Integración real de pagos (Stripe/Adyen) y facturación.
- Base de datos productiva y migraciones (se deja el puerto y el adaptador preparados).
- CMS/ERP real (Shopify, Medusa, Contentful) — se deja el adaptador preparado.
- Envío de emails reales, cupones complejos, programa de fidelidad, multi-almacén.
- Extracción a monorepo (`packages/*`): se documenta el playbook, no se ejecuta.

### 0.3 No-objetivos

- No se rediseña la identidad visual: los tokens de color, tipografías y tono editorial actuales **se conservan**.
- No se cambian las URLs existentes (ver §14.3).
- No se introduce un framework de estado, ni librerías de clases CSS, ni TSDX.

### 0.4 Asunciones

1. El destinatario de este documento es el equipo de TI, que ejecutará las fases.
2. El idioma del producto es `es-ES` y la moneda `EUR`; se prepara la estructura para añadir idiomas, pero solo se implementa uno.
3. El gestor de paquetes se mantiene en **npm** (existe `package-lock.json`); pnpm queda como opción documentada.
4. El entorno de producción admite ejecución de Node (SSR con `dist/server/server.js`), no solo estáticos.
5. Se puede inicializar un repositorio git y configurar CI en GitHub Actions (o equivalente).

---

## 1. Diagnóstico del estado actual

### 1.1 Inventario verificado

| Elemento | Valor real comprobado |
|---|---|
| Framework | TanStack Start (`@tanstack/react-start`), TanStack Router file-based |
| React / TS / Vite | React 19.1, TypeScript 5.8, Vite 7 |
| Estilos | Tailwind CSS 4.1 vía `@tailwindcss/vite`, tokens en `src/styles.css` (`@theme`) |
| Runtime | Node v24.14.0, npm 11.9.0, `"type": "module"` |
| Rutas | 9: `/`, `/shop`, `/products/$slug`, `/cart`, `/checkout`, `/login`, `/register`, `/account`, `/wishlist` |
| Datos | 28 productos mock + 4 categorías + 3 colecciones + 2 métodos de envío |
| Componentes | 12, en `components/{layout,product,cart,ui}` |
| Estado | 1 solo `src/lib/store.tsx` (206 líneas): carrito, wishlist, usuario y estado de UI |
| Salida de build | `dist/client/*` y `dist/server/server.js` (61.650 bytes) |
| Ya presente (transitivo) | `zod` 4.6.5, `@tanstack/router-plugin` 1.168.38, `prettier` 3.9.6 |
| Ausente | `.git`, ESLint, Vitest, Playwright, CI, tests, `.env.example`, `docs/`, `@tanstack/react-query` |
| Artefactos mal gestionados | `dist/` y `.tanstack/` existen en disco y **no** están en `.gitignore` (solo lo está `.output`, que además no se genera) |

### 1.2 Estructura actual

```
jesus ecomerce/
├─ src/
│  ├─ router.tsx
│  ├─ routeTree.gen.ts
│  ├─ styles.css
│  ├─ components/
│  │  ├─ cart/     CartDrawer.tsx · CartSummary.tsx
│  │  ├─ layout/   Header.tsx · Footer.tsx · MegaMenu.tsx · MobileMenu.tsx · SearchOverlay.tsx
│  │  ├─ product/  ProductCard.tsx · ProductGrid.tsx
│  │  └─ ui/       Badge.tsx · Button.tsx · Drawer.tsx · EmptyState.tsx · QuantitySelector.tsx · SectionHeading.tsx
│  ├─ data/        products.ts · categories.ts · collections.ts · shipping.ts · types.ts · index.ts · productLookup.ts
│  ├─ lib/         store.tsx · format.ts
│  └─ routes/      __root.tsx + 9 rutas
├─ dist/           (build, sin ignorar)
├─ .tanstack/      (tmp del generador de rutas, sin ignorar)
├─ package.json · package-lock.json · tsconfig.json · vite.config.ts · .gitignore
└─ "Prompt — E-commerce premium inspirado en Chloé con TanStack Start.md" (910 líneas, brief original)
```

### 1.3 Problemas arquitectónicos de fondo

| # | Problema | Consecuencia |
|---|---|---|
| A1 | **No hay capas.** `components/` mezcla presentación pura (`Button`, `Badge`) con lógica de dominio (`CartDrawer` calcula totales, `MegaMenu` importa datos mock). | Imposible reutilizar sin arrastrar dependencias; nada es testeable de forma aislada. |
| A2 | **Los mock son la API.** `wishlist.tsx:2` importa `@/data/products`; `SearchOverlay.tsx:3` importa `queryProducts`; `MegaMenu.tsx:2` importa categorías y colecciones. | Al conectar una API real hay que tocar cada componente: justo lo que el brief original pedía evitar. |
| A3 | **No hay backend.** No existe ningún proceso servidor: el "checkout" crea un `Order` en memoria del navegador y lo pierde al recargar (`checkout.tsx:63-76`). | No hay pedidos, ni stock real, ni sesiones, ni posibilidad de auditar. |
| A4 | **Dos fuentes de verdad para el total.** `lib/store.tsx:103-104` fija envío `standard`; `checkout.tsx:40-41` recalcula con el método elegido. | El usuario puede ver un total en el carrito y otro en el checkout. Defecto inaceptable en comercio premium. |
| A5 | **Sin tipado en las fronteras.** 3 × `as never` (`shop.tsx:84,89,90`), `to?: string` en `Button` (`Button.tsx:10`), URLs con query string (`index.tsx:106`, `MegaMenu.tsx` completo). | El compilador no detecta enlaces rotos ni parámetros inválidos; los errores llegan a producción. |
| A6 | **Estado global monolítico.** Carrito + wishlist + usuario + `cartOpen` en un solo contexto. | Cualquier cambio re-renderiza todo el árbol; no hay selectores; imposible testear el reducer porque no existe. |
| A7 | **Cero pruebas y cero linting.** Sin ESLint, sin Vitest, sin e2e, sin CI. | Ninguna refactorización es segura; cada cambio es una apuesta. |
| A8 | **Sin control de versiones.** No existe `.git`. | No hay historial, ni revisión, ni rollback, ni trabajo en paralelo. |
| A9 | **Modelo de dominio insuficiente.** `Product.colors: string[]`, `stock` por producto, `CategoryId` como union hardcodeado (`data/types.ts:22`). | No se puede vender una talla concreta, ni un color con stock propio, ni añadir una categoría sin tocar código. |
| A10 | **Duplicación de estilos.** El patrón `text-[11px] uppercase tracking-[0.25em] text-taupe` aparece en 12+ archivos. | Cambiar el "eyebrow" de la marca obliga a buscar y reemplazar en todo el proyecto. |
| A11 | **Accesibilidad incompleta.** Sin focus trap ni `role="dialog"` en drawers/overlays; el mega menú solo abre por hover. | Incumplimiento WCAG, mala experiencia con teclado, riesgo legal en comercio. |

### 1.4 Defectos concretos (con evidencia)

Ver §10 para el registro completo y numerado. Los más graves:

- **D1** — El mega menú **nunca se ve** (variante Tailwind inexistente).
- **D2** — El script `start` apunta a un archivo que no se genera.
- **D3** — Doble ordenamiento en el catálogo.
- **D4** — `?category=foo` devuelve catálogo vacío en silencio.
- **D5** — Total del carrito ≠ total del checkout según el método de envío.
- **D6** — Login que acepta cualquier contraseña y guarda el usuario en `localStorage`.

---

## 2. Investigación TSDX: qué se adopta y qué no

### 2.1 Qué es TSDX y cómo funciona

TSDX (`jaredpalmer/tsdx`) es un CLI **zero-config** para desarrollar **paquetes** TypeScript:

- Creación: `tsdx create <nombre>` con plantillas `basic`, `react`, `react-with-storybook`.
- Convención de entrada: **una única** `src/index.ts` por paquete; todo lo demás es interno.
- Salida: `dist/` con CJS + ESM + declaraciones `.d.ts` mediante una configuración de Rollup/Babel que el usuario no escribe.
- Baterías incluidas: build, dev (watch), test (Jest), lint (ESLint + Prettier), sin configuración.
- Formato de import: `import { cosa } from 'mi-paquete'` — el consumidor nunca entra en rutas internas.
- **Modo monorepo:** workspaces + `packages/*`, cada paquete con su `src/index.ts`, alias de path apuntando a `packages/*/src` para consumir el código fuente sin compilar entre paquetes, y una raíz que solo orquesta.

### 2.2 Estado de mantenimiento (dato relevante)

TSDX está **sin mantenimiento activo** y el ecosistema ha migrado a los equivalentes actuales. Evidencia pública de ese movimiento:

- [marigold-ui/marigold#1661 — "Move away from tsdx"](https://github.com/marigold-ui/marigold/issues/1661)
- [MystenLabs/sui — "Remove TSDX, replace with tsup / vitest"](https://github.com/MystenLabs/sui/commit/c5e4851b3ad750ec08499af0ddf3adfb16fff4c3)
- [lecstor/tsdx-monorepo](https://github.com/lecstor/tsdx-monorepo) — referencia del patrón monorepo que inspira §3.5

**Conclusión:** para una **aplicación** full-stack (no una librería) TSDX no es la herramienta adecuada. Se adoptan sus **principios de organización** y se sustituye su stack por el actual.

### 2.3 Principio → aplicación en este proyecto

| Principio TSDX | Aplicación concreta aquí |
|---|---|
| Un repo, un toolchain, configuración raíz delgada | Un `vite.config.ts`, un `tsconfig.json` + `tsconfig.node.json`, un lockfile, un ESLint. **Cero** configuraciones por carpeta. |
| Entrada única y explícita | `src/app/router.tsx` es la única entrada de routing; `src/routes/__root.tsx` es el único punto de composición del documento. |
| Cada módulo es un paquete en potencia | Toda `features/<x>` y todo `server/<x>` exponen su API en `index.ts`; sus archivos internos son privados. |
| El consumidor no entra en rutas internas | Import cruzado **solo** por la API pública: `@/features/cart` (nunca `@/features/cart/model/cartReducer` desde fuera del slice). Impuesto por ESLint. |
| Alias en lugar de rutas relativas profundas | `@/app`, `@/features`, `@/domain`, `@/server`, `@/ui`, `@/lib` (con `@/*` → `src/*` mantenido durante la migración). |
| Salida determinista y un comando | `npm run build` → `dist/{client,server}`; `npm start` **corregido** a `node dist/server/server.js`. |
| Monorepo-ready, no monorepo-now | Playbook de extracción a `packages/{domain,ui,api-client}` documentado en §9 (Fase 5), ejecutable solo cuando exista un segundo consumidor. |
| Stack sin mantenimiento → equivalente actual | TSDX no se instala. Sustitutos: **Vite** (build/dev), **Vitest** (reemplaza Jest), **ESLint 9 flat + Prettier** (reemplaza `tsdx lint`), **tsup** únicamente si algún día se publica un paquete npm. |

### 2.4 Lo que explícitamente NO se hace

| Descartado | Motivo |
|---|---|
| Instalar TSDX / escribir configs de Rollup-Babel | Es una app, no una librería; el bundler ya es Vite y está resuelto por el plugin de TanStack Start. |
| Crear un monorepo ahora | Sin un segundo consumidor, añade coste (workspaces, versionado, builds cruzados) sin beneficio. Los principios se aplican dentro de `src/`. |
| Cambiar Jest por Jest | Vitest comparte configuración con Vite y no necesita transformaciones extra. |
| Añadir `zustand`, `clsx`, `cva` o similares | El estado de cliente es pequeño y se cubre con reducers puros + contextos delgados; `cn()` se implementa en 5 líneas en `lib/cn.ts`. Menos dependencias = menos superficie de mantenimiento. |

---

## 3. Arquitectura objetivo

### 3.1 Principios

1. **Un solo proyecto, un solo árbol `src/`.** Backend y frontend conviven; no hay `frontend/` + `backend/`.
2. **Capas con dirección de dependencia única** (§3.3). Las capas de abajo no conocen a las de arriba.
3. **Vertical slices por capacidad de negocio** (`features/*`): cada slice contiene sus componentes, hooks, schemas, server functions y textos.
4. **Núcleo puro y testeable** (`domain/*`): reglas de negocio sin React, sin red, sin framework.
5. **Fronteras impuestas por herramienta**: alias de paths + `import-x/no-restricted-paths` + `createServerOnlyFn` + revisión de bundle.
6. **Explícito antes que mágico**: nombres de archivo descriptivos, sin barrels que oculten dependencias circulares, sin código en `index.ts` más allá de re-exports.

### 3.2 Árbol canónico

```
jesus-ecomerce/
├─ src/
│  ├─ app/                                # capa de composición (bootstrap de la aplicación)
│  │  ├─ router.tsx                       # createRouter: context, scroll, preload, boundaries por defecto
│  │  ├─ providers.tsx                    # QueryClientProvider + CartProvider + WishlistProvider + UiProvider
│  │  ├─ config/
│  │  │  ├─ site.ts                       # marca, locales ['es-ES'], moneda EUR, regiones, redes, contacto
│  │  │  └─ env.ts                        # import.meta.env validado con Zod (falla al arrancar si falta algo)
│  │  └─ styles/
│  │     ├─ tokens.css                    # @theme: color, tipografía, spacing, radios, sombras, foco, motion
│  │     ├─ base.css                      # html/body/selection/focus-visible/skip-link
│  │     ├─ utilities.css                 # @utility eyebrow|btn|btn-outline|field|skeleton + @custom-variant
│  │     └─ index.css                     # única hoja importada por routes/__root.tsx
│  ├─ routes/                             # SOLO routing y orquestación
│  │  ├─ __root.tsx                       # documento HTML, SEO base, boundaries globales, import de estilos
│  │  ├─ _storefront.tsx                  # layout pathless de tienda: Header + MegaMenu + Footer + CartDrawer
│  │  ├─ _storefront.index.tsx            # /
│  │  ├─ _storefront.shop.index.tsx       # /shop
│  │  ├─ _storefront.shop.$category.tsx   # /shop/:category
│  │  ├─ _storefront.products.$slug.tsx   # /products/:slug
│  │  ├─ _storefront.cart.tsx             # /cart
│  │  ├─ _storefront.wishlist.tsx         # /wishlist
│  │  ├─ _storefront.search.tsx           # /search (búsqueda con URL compartible)
│  │  ├─ _checkout.checkout.tsx           # /checkout (layout mínimo: sin header/footer de tienda)
│  │  ├─ _account.tsx                     # layout de área de cliente
│  │  ├─ _account.login.tsx               # /login
│  │  ├─ _account.register.tsx            # /register
│  │  ├─ _account.account.tsx             # /account (guard en beforeLoad)
│  │  └─ api/                             # server routes (endpoints HTTP)
│  │     ├─ sitemap[.]xml.ts              # /sitemap.xml
│  │     ├─ robots[.]txt.ts               # /robots.txt
│  │     ├─ health.ts                     # /api/health (runbook, monitorización)
│  │     └─ webhooks.payments.ts          # webhook de la pasarela (fase 5)
│  ├─ features/                           # vertical slices por capacidad de negocio
│  │  ├─ catalog/                         # PLP: listado, filtros, orden, paginación, tarjetas
│  │  ├─ product/                         # PDP: galería, variantes, detalles, relacionados
│  │  ├─ cart/                            # carrito: reducer, persistencia, drawer, página
│  │  ├─ checkout/                        # formulario, envío, resumen, creación de pedido
│  │  ├─ orders/                          # historial y detalle de pedidos del cliente
│  │  ├─ wishlist/                        # favoritos
│  │  ├─ account/                         # sesión, login, registro, perfil
│  │  ├─ search/                          # overlay de búsqueda y resultados
│  │  ├─ navigation/                      # menú principal, mega menú, menú móvil, breadcrumbs
│  │  └─ editorial/                       # home: hero, universos, atelier, colecciones, newsletter
│  ├─ domain/                             # núcleo puro (sin React, sin red, sin framework)
│  │  ├─ money/                           # Money, Currency, aritmética en unidades menores
│  │  ├─ catalog/                         # filtrado, orden, paginación, facetas (funciones puras)
│  │  ├─ pricing/                         # subtotal, descuentos, envío, impuestos, total
│  │  ├─ shipping/                        # zonas, métodos, umbral de envío gratuito
│  │  ├─ inventory/                       # disponibilidad, reservas, reglas de stock
│  │  └─ order/                           # entidad Order, estados, transiciones válidas
│  ├─ server/                             # BACKEND (mismo árbol, sin carpeta separada)
│  │  ├─ runtime/
│  │  │  ├─ container.ts                  # composición: elige adaptadores según env (único punto de cambio)
│  │  │  ├─ middleware.ts                 # requestId → logger → session → errorNormalizer → csrf
│  │  │  ├─ session.ts                    # cookie firmada httpOnly + sameSite, lectura/escritura de sesión
│  │  │  ├─ errors.ts                     # AppError, códigos de error, mapeo a respuestas
│  │  │  └─ logger.ts                     # log estructurado con requestId, sin PII
│  │  ├─ repositories/
│  │  │  ├─ catalog.port.ts               # interfaz CatalogRepository
│  │  │  ├─ orders.port.ts                # interfaz OrderRepository
│  │  │  ├─ customers.port.ts             # interfaz CustomerRepository
│  │  │  ├─ inventory.port.ts             # interfaz InventoryRepository
│  │  │  ├─ in-memory/                    # adaptadores actuales (leen server/seed)
│  │  │  └─ (postgres/ | medusa/ | shopify/)   # adaptadores futuros, misma interfaz
│  │  ├─ services/                        # casos de uso: quoteCart, placeOrder, adjustInventory, notify
│  │  └─ seed/                            # catálogo normalizado: products, categories, collections, shipping
│  ├─ ui/                                 # design system (sin dominio)
│  │  ├─ primitives/                      # Button, Drawer, Modal, Badge, Field, AspectImage, QuantityStepper, Skeleton, Tabs
│  │  ├─ patterns/                        # Header, Footer, SectionHeading, EmptyState, ErrorState, ProductRail, Breadcrumbs
│  │  └─ index.ts                         # API pública del design system
│  ├─ lib/                                # utilidades transversales
│  │  ├─ cn.ts · result.ts · money-format.ts · seo.ts · storage.ts · i18n.ts · dates.ts · slug.ts
│  ├─ tests/                              # setup de Vitest, factories y fixtures compartidos
│  └─ routeTree.gen.ts                    # GENERADO por el plugin — no editar a mano
├─ tests/e2e/                             # Playwright: embudo completo, a11y, viewports
├─ docs/
│  ├─ architecture.md                     # este árbol + matriz de dependencias + decisiones
│  ├─ conventions.md                      # chuleta de reglas, plantillas de archivo, nomenclatura
│  ├─ runbook.md                          # despliegue, variables, incidentes, rollback
│  └─ adr/0001-…-0008-*.md                # decisiones de arquitectura registradas
├─ public/                                # favicon, fuentes locales, imágenes de marca
├─ plan.md                                # este documento
├─ .github/workflows/verify.yml           # typecheck → lint → test → build (+ e2e)
├─ vite.config.ts · vitest.config.ts · playwright.config.ts
├─ tsconfig.json · tsconfig.node.json · tsconfig.tests.json
├─ eslint.config.js · .prettierrc · .prettierignore
├─ .env.example · .gitignore · README.md · CHANGELOG.md
```

### 3.3 Matriz de dependencias (regla dura)

| Desde ↓ / Puede importar → | `app/config` | `ui` | `lib` | `domain` | `features/*` | `server` | `routes` |
|---|---|---|---|---|---|---|---|
| `routes/**` | ✅ | ✅ | ✅ | ✅ | ✅ (solo API pública) | ❌ | — |
| `features/*/components` · `hooks` · `model` | ✅ | ✅ | ✅ | ✅ | ✅ (solo API pública de otra feature) | ❌ | ❌ |
| `features/*/api/*.server.ts` | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ |
| `domain/**` | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `ui/**` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `lib/**` | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `server/**` | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ |

**Regla mnemotécnica para el equipo:**

> `domain` no conoce a nadie · `ui` no conoce el dominio · el cliente **nunca** importa `@/server/**` · `routes` solo orquesta.

**Excepción única y explícita:** los archivos `*.server.ts` dentro de una feature pueden importar `@/server/**`. Es la frontera legítima entre frontend y backend dentro del mismo árbol.

### 3.4 Anatomía obligatoria de una feature

```
features/catalog/
├─ index.ts                          # ÚNICA API pública del slice (re-exporta lo permitido)
├─ api/
│  ├─ list-products.server.ts        # createServerFn(...).validator(...).handler(...)
│  └─ get-product.server.ts
├─ model/
│  ├─ schemas.ts                     # Zod: schemas de entrada/salida de la API
│  ├─ search-params.ts               # shopSearchSchema + parse/serialize (Zod)
│  ├─ queries.ts                     # queryOptions() reutilizables por loader y componente
│  └─ copy.ts                        # textos del slice (i18n-ready, sin literales en componentes)
├─ components/
│  ├─ CatalogView.tsx
│  ├─ FilterPanel.tsx · FilterGroup.tsx · SortSelect.tsx · ActiveFilters.tsx · Pagination.tsx
│  ├─ ProductCard.tsx · ProductGrid.tsx
│  └─ CatalogSkeleton.tsx · CatalogEmptyState.tsx
└─ __tests__/
   ├─ catalog-view.test.tsx
   └─ search-params.test.ts
```

Regla: si una feature necesita algo de otra, se importa su `index.ts`. Si necesita "un poco de otra feature", esa funcionalidad probablemente pertenece a `domain/` o `ui/`.

### 3.5 Playbook "monorepo-ready" (documentado, no ejecutado)

Cuando aparezca un segundo consumidor (app móvil, panel de administración, widget embebible):

1. `npm init -w packages/domain -w packages/ui -w packages/api-client` (npm workspaces).
2. Mover `src/domain`, `src/ui` y los `api/` compartidos a `packages/*/src`, conservando su `index.ts` como entrada.
3. Aliases del `tsconfig` raíz apuntando a `packages/*/src` (así se consume fuente sin build previo, exactamente el truco de TSDX monorepo).
4. Añadir `tsup` **solo** para los paquetes que deban publicarse como npm.
5. La app sigue en la raíz y no cambia ni una importación, porque ya usaba `@/domain` y `@/ui`.

Ese es el motivo por el que las fronteras se imponen **desde el día uno**: hacen que esta extracción sea mecánica en vez de traumática.

### 3.6 Convenciones de nomenclatura

| Elemento | Convención | Ejemplo |
|---|---|---|
| Carpetas | `kebab-case` | `features/catalog/model/search-params.ts` |
| Archivos de componente | `PascalCase.tsx`, un componente por archivo | `ProductCard.tsx` |
| Hooks | `use-*.ts` en `model/` o `hooks/` | `use-cart.ts` |
| Server functions | `*.server.ts`, verbo + entidad | `list-products.server.ts` |
| Schemas Zod | `*.ts` en `model/schemas.ts`, sufijo `Schema` | `productSchema` |
| Tipos de dominio | `PascalCase` + tipos branded | `ProductId`, `Sku`, `Money` |
| Constantes | `SCREAMING_SNAKE_CASE` solo si son primitivas globales | `FREE_SHIPPING_THRESHOLD` |
| Rutas | convención del generador: `_` pathless, `$param`, `index`, `route` | `_storefront.shop.$category.tsx` |
| Tests | junto al código en `__tests__/` o `.test.ts` co-locado | `cart-reducer.test.ts` |

---

## 4. Backend en el mismo árbol

El backend **no es una carpeta separada**: es el conjunto `src/server/**` (infraestructura) más los archivos `*.server.ts` de cada feature (superficie cliente↔servidor). TanStack Start es un framework full-stack: ejecuta el mismo proyecto en el servidor (SSR + endpoints) y en el cliente.

### 4.1 APIs realmente disponibles (verificado en `node_modules`)

Desde `@tanstack/react-start`:

| API | Uso en este proyecto |
|---|---|
| `createServerFn({ method })` | Declarar toda server function. |
| `.validator(zodSchema)` / `.validator(...)` | Validar la entrada **antes** de que el handler se ejecute. |
| `createMiddleware` | Cadena: contexto, sesión, logging, errores, CSRF. |
| `createCsrfMiddleware` | Protección de server functions mutadoras (checkout, cuenta, wishlist). |
| `createServerOnlyFn` | Marcar código que **solo** puede ejecutarse en servidor. Si se filtra al cliente, **falla el build**. |
| `createClientOnlyFn` | Marcar código que solo puede ejecutarse en el navegador. |
| `createIsomorphicFn` | Implementación distinta en cliente y servidor con el mismo nombre. |
| `useSession` (desde `@tanstack/react-start/server`) | Gestión de sesión en servidor con cookie firmada. |
| `useServerFn` | Invocar una server function desde un componente cliente. |

### 4.2 Contrato cliente ↔ servidor

```ts
// features/catalog/api/list-products.server.ts
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getContainer } from '@/server/runtime/container'
import { catalogFiltersSchema } from '../model/schemas'

export const listProducts = createServerFn({ method: 'GET' })
  .validator(catalogFiltersSchema)
  .handler(async ({ data, context }) => {
    const { catalog } = getContainer(context.env)
    return catalog.search(data)
  })
```

Consumo desde la UI (nunca `fetch` manual):

```ts
const products = await listProducts({ data: { category: 'eyewear', sort: 'price-asc' } })
// o dentro de un componente:
const run = useServerFn(listProducts)
```

**Reglas:**

- Toda entrada se valida con Zod. Sin excepciones (evita el defecto D4 en su origen).
- Toda respuesta es serializable y **tipada de extremo a extremo** (no hay `any`).
- Lectura → `method: 'GET'`; escritura → `method: 'POST'` + CSRF + idempotencia.
- Un handler no contiene lógica de negocio: delega en `server/services/*` y en `domain/*`.

### 4.3 Middleware

```
server/runtime/middleware.ts

requestContext   → requestId (crypto.randomUUID), locale, región, moneda
logger           → log estructurado de entrada/salida y duración, sin PII
session          → resuelve la sesión (cookie firmada) y la inyecta en el contexto
errorNormalizer  → convierte excepciones en AppError con código y mensaje seguro
csrf             → createCsrfMiddleware en toda server function mutadora
```

Toda server function mutadora se declara así:

```ts
export const placeOrder = createServerFn({ method: 'POST' })
  .middleware([csrfMiddleware, requireSession])
  .validator(placeOrderSchema)
  .handler(async ({ data, context }) => { /* ... */ })
```

### 4.4 Puertos y adaptadores

Interfaces (puertos) en `src/server/repositories/*.port.ts`:

```ts
export interface CatalogRepository {
  search(filters: CatalogFilters): Promise<Paginated<ProductSummary>>
  findBySlug(slug: string): Promise<Product | null>
  findByIds(ids: ProductId[]): Promise<Product[]>
  listCategories(): Promise<Category[]>
  listCollections(): Promise<Collection[]>
  listFacets(filters: CatalogFilters): Promise<FacetSet>
}

export interface OrderRepository {
  create(order: NewOrder, idempotencyKey: string): Promise<Order>
  findByNumber(orderNumber: string): Promise<Order | null>
  listByCustomer(customerId: CustomerId): Promise<OrderSummary[]>
}

export interface InventoryRepository {
  availability(skus: Sku[]): Promise<Record<Sku, number>>
  reserve(lines: OrderLine[], ttlSeconds: number): Promise<ReservationId>
  release(reservationId: ReservationId): Promise<void>
  commit(reservationId: ReservationId): Promise<void>
}

export interface CustomerRepository {
  findByEmail(email: string): Promise<Customer | null>
  create(input: NewCustomer): Promise<Customer>
}
```

Adaptadores:

| Puerto | Fase 2–4 | Fase 5+ |
|---|---|---|
| `CatalogRepository` | `in-memory/catalog.in-memory.ts` leyendo `server/seed` | `shopify/`, `medusa/`, `postgres/` (Drizzle) |
| `OrderRepository` | `in-memory/orders.in-memory.ts` | `postgres/orders.postgres.ts` |
| `InventoryRepository` | `in-memory/inventory.in-memory.ts` | `postgres/` o ERP |
| `CustomerRepository` | `in-memory/customers.in-memory.ts` | `postgres/` |
| `PaymentGateway` | `in-memory/fake-payment-gateway.ts` (simulado) | `stripe/` |
| `PasswordHasher` | `dev/dev-password-hasher.ts` | `scrypt/` o `argon2/` |

Selección en **un único archivo**, `server/runtime/container.ts`:

```ts
export function getContainer(env: Env) {
  if (env.DATA_SOURCE === 'in-memory') return inMemoryContainer()
  if (env.DATA_SOURCE === 'postgres') return postgresContainer(env)
  throw new AppError('CONFIG', `DATA_SOURCE desconocido: ${env.DATA_SOURCE}`)
}
```

### 4.5 Dinero y precios: el servidor es la autoridad

- Todo importe es un **entero en unidades menores** (céntimos) más su `Currency`. Nunca `float` para dinero.
- `domain/money` implementa `add`, `subtract`, `multiply`, `percentage`, `allocate` (reparto proporcional sin perder céntimos).
- `domain/pricing` calcula: subtotal por línea → descuentos → envío según zona/peso/umbral → impuestos → total.
- La server function `quoteCart` devuelve el objeto autoritativo:

```ts
export interface CartQuote {
  lines: Array<{
    variantId: VariantId
    sku: Sku
    name: string
    unitPrice: Money
    quantity: number
    lineTotal: Money
    availability: 'in_stock' | 'low' | 'out_of_stock'
  }>
  subtotal: Money
  discounts: Array<{ code: string; label: string; amount: Money }>
  shippingOptions: Array<{ id: ShippingOptionId; label: string; eta: string; price: Money }>
  selectedShipping?: ShippingOptionId
  tax: Money
  total: Money
  freeShippingRemaining?: Money
}
```

El cliente **pinta** ese objeto. Se elimina por completo el cálculo duplicado actual (`lib/store.tsx:103-104` vs `checkout.tsx:40-41`) — defecto **D5**.

### 4.6 Inventario

- El stock vive **por variante (SKU)**, no por producto. `Product.stock` pasa a ser un agregado derivado de sus variantes.
- Al crear un pedido se **reserva** stock con TTL; al confirmar el pago se **compromete**; si expira o falla el pago, se **libera**.
- `availability` se devuelve en la cotización y en el listado, con estados `in_stock | low | out_of_stock` (hoy existe `stock: 0` → "Agotado", pero sin reservas ni concurrencia).

### 4.7 Pedidos

`server/services/place-order.ts`:

1. Valida el payload con Zod (`placeOrderSchema`).
2. **Re-cotiza en servidor** a partir de las líneas y el envío elegido (nunca confía en totales del cliente).
3. Comprueba disponibilidad y reserva inventario.
4. Cobra a través del puerto `PaymentGateway` (simulado en Fase 2).
5. Persiste el pedido con `idempotencyKey` (reintentos y doble clic no duplican pedidos).
6. Emite el evento de dominio `OrderPlaced` (punto de extensión para emails, analítica, ERP).
7. Devuelve `{ orderNumber, status, totals }`.

Ciclo de vida: `draft → placed → paid → fulfilled → cancelled | refunded`, con transiciones válidas declaradas en `domain/order/transitions.ts` (una transición no permitida lanza error de dominio).

### 4.8 Sesión y cuentas

- Sesión en **cookie firmada** `httpOnly`, `sameSite=lax`, `secure` en producción, gestionada con `useSession` desde `@tanstack/react-start/server`.
- Las server functions `login`, `register`, `logout` viven en `features/account/api/*.server.ts` y usan los puertos `CustomerRepository` + `PasswordHasher`.
- En Fase 2 el hasher es de desarrollo (documentado como tal) y existe un usuario demo; **lo importante es que la autoridad es el servidor**.
- Protección de rutas con guard, no con un `if` dentro del componente:

```ts
// routes/_account.account.tsx
export const Route = createFileRoute('/_account/account')({
  beforeLoad: async ({ location }) => {
    const session = await getSessionFn()
    if (!session.user) throw redirect({ to: '/login', search: { redirect: location.href } })
    return { user: session.user }
  },
})
```

Desaparece el usuario en `localStorage` — defecto **D6**.

### 4.9 Errores

```ts
export type ErrorCode =
  | 'VALIDATION' | 'NOT_FOUND' | 'OUT_OF_STOCK' | 'PAYMENT_DECLINED'
  | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'CONFLICT' | 'RATE_LIMITED'
  | 'CONFIG' | 'INTERNAL'

export class AppError extends Error {
  constructor(readonly code: ErrorCode, message: string, readonly cause?: unknown) { super(message) }
}
```

- **Fallos esperados** (stock insuficiente, promoción inválida, pago rechazado): se devuelven como resultado tipado `{ ok: false, error: { code, message } }` y la UI muestra un estado premium, no un stack.
- **Fallos de programación**: excepción → middleware `errorNormalizer` → `errorComponent` de la ruta.
- Nunca se expone un mensaje interno al cliente en producción.

### 4.10 Observabilidad y entorno

- `server/runtime/logger.ts`: log estructurado (`level`, `requestId`, `route`, `durationMs`, `errorCode`), sin PII ni datos de pago.
- `requestId` generado en middleware y devuelto en la respuesta, para correlacionar con el runbook.
- `routes/api/health.ts` como endpoint de salud para despliegue y monitorización.
- `app/config/env.ts` valida con Zod el entorno en el arranque (fallo rápido y explícito):

```
DATA_SOURCE=in-memory
SESSION_SECRET=<32+ chars>
PUBLIC_SITE_URL=https://…
PAYMENTS_PROVIDER=fake
```

`.env.example` documentado en el repo; los secretos jamás llegan al bundle cliente (verificado por build).

---

## 5. Frontend, estado y design system

### 5.1 Rutas delgadas

Cada archivo de `routes/` tiene una única responsabilidad: **declarar** la ruta y **componer** componentes de features. Objetivo: menos de 80 líneas por archivo, cero JSX de negocio.

```tsx
// routes/_storefront.products.$slug.tsx
export const Route = createFileRoute('/_storefront/products/$slug')({
  loader: async ({ params, context }) => {
    const product = await context.queryClient.ensureQueryData(productQuery(params.slug))
    if (!product) throw notFound()
    return { product }
  },
  head: ({ loaderData }) => productHead(loaderData?.product),
  component: ProductPage,
  pendingComponent: ProductSkeleton,
  errorComponent: ProductError,
  notFoundComponent: ProductNotFound,
})

function ProductPage() {
  const { product } = Route.useLoaderData()
  return <ProductDetailView product={product} />
}
```

Convenciones verificadas contra el generador instalado (`@tanstack/router-generator`): `routesDirectory: ./src/routes`, `generatedRouteTree: ./src/routeTree.gen.ts`, `indexToken: "index"`, `routeToken: "route"`, prefijo `-` ignorado (archivos no-ruta), `_` = ruta pathless, `$param` = parámetro, `autoCodeSplitting` disponible, configuración opcional en `tsr.config.json`.

### 5.2 Loaders y datos

- Los datos se cargan en el **loader** con `queryClient.ensureQueryData(queryOptions(...))`: SSR con HTML completo y reutilización en cliente sin refetch.
- Las `queryOptions` viven en `features/*/model/queries.ts` y se comparten entre loader y componente (una sola definición de la clave de caché).
- Estados obligatorios en **todas** las rutas de datos: `pendingComponent` (skeleton), `errorComponent`, `notFoundComponent`.

### 5.3 Search params tipados

Hoy los filtros son `string` sueltos y `?category=foo` produce una página vacía en silencio (defecto **D4**). Objetivo:

```ts
// features/catalog/model/search-params.ts
export const shopSearchSchema = z.object({
  category: categoryIdSchema.optional().catch(undefined),
  collection: collectionIdSchema.optional().catch(undefined),
  color: z.array(colorIdSchema).default([]).catch([]),
  material: z.array(materialIdSchema).default([]).catch([]),
  priceMin: z.coerce.number().int().nonnegative().optional().catch(undefined),
  priceMax: z.coerce.number().int().nonnegative().optional().catch(undefined),
  sort: sortIdSchema.default('recommended').catch('recommended'),
  page: z.coerce.number().int().min(1).default(1).catch(1),
})
export type ShopSearch = z.infer<typeof shopSearchSchema>
```

Ventajas: la URL es **compartible y canónica**, el SSR filtra en servidor, y un parámetro inválido degrada con elegancia en lugar de romper.

### 5.4 Capas de estado

| Tipo de estado | Dónde vive | Herramienta |
|---|---|---|
| Datos de servidor (productos, pedidos, sesión) | Caché de consultas | `@tanstack/react-query` v5 (`QueryClient` en `app/providers.tsx`) |
| Carrito, wishlist | Reducers puros en `domain/` + contexto delgado en `features/*/model` | `useReducer` + context (sin librerías externas) |
| Filtros, orden, paginación, búsqueda | **URL** (search params tipados) | TanStack Router |
| UI efímera (drawer abierto, menú abierto, overlay) | `features/*/model/ui-store.ts` | `useState`/context local |

Detalle del carrito:

```
domain/cart/cart-reducer.ts        ← puro, testeable sin React
domain/cart/cart-selectors.ts      ← puro (totales de líneas, conteo)
features/cart/model/cart-storage.ts← persistencia versionada + Zod + migración
features/cart/model/CartProvider.tsx
features/cart/model/use-cart.ts    ← fachada pública del slice
```

Persistencia: clave `ml.cart.v2`, validada con Zod al leer, con migración desde `ml.cart.v1` (`{ productId, color, quantity }` → `{ variantId, quantity }`), tolerante a `localStorage` no disponible (modo privado/SSR).

### 5.5 Design system

**Tokens** (`app/styles/tokens.css`) — se conservan los colores actuales (`ivory`, `sand`, `linen`, `clay`, `taupe`, `charcoal`, `ink`, `gold`) y se añaden escalas que hoy no existen:

- tipografía: `--text-eyebrow`, `--text-body`, `--text-display`, con line-height y tracking asociados;
- espaciado semántico de secciones (`--space-section-y`), radios, sombras, duración/easing de motion;
- `--focus-ring` y contraste verificado AA.

**Utilidades** (`app/styles/utilities.css`):

```css
@custom-variant group-nav (&:is(:hover, :focus-within));   /* arregla el mega menú — D1 */

@utility eyebrow  { @apply text-[11px] uppercase tracking-[0.25em] text-taupe; }
@utility btn      { @apply inline-flex items-center justify-center uppercase tracking-[0.2em] transition-colors duration-300; }
@utility btn-outline { @apply border border-ink text-ink hover:bg-ink hover:text-ivory; }
@utility field    { @apply w-full border border-linen bg-transparent px-4 py-3 text-sm outline-none placeholder:text-clay focus:border-ink; }
@utility skeleton { @apply animate-pulse bg-linen; }
@utility focus-ring { @apply focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2; }
```

Esto elimina la duplicación masiva de cadenas (defecto **D10**) y hace que un cambio de estilo de marca sea un cambio de token.

**Componentes**: `ui/primitives/*` sin conocimiento del dominio (reciben props y children), y `ui/patterns/*` como composiciones presentacionales. Los componentes de negocio (`ProductCard`, `FilterPanel`, `CartDrawer`) viven en su feature.

### 5.6 Accesibilidad (requisito, no mejora)

| Elemento | Requisitos |
|---|---|
| `Drawer` / `Modal` / `SearchOverlay` | `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, focus trap, cierre con `Escape`, restauración de foco al elemento disparador, bloqueo de scroll compartido |
| Mega menú | Apertura por teclado (`aria-expanded`, `aria-haspopup`), foco al panel, cierre con `Escape` y al salir con `Tab`, `focus-within` como variante CSS |
| Menú móvil | `aria-hidden` + `inert` en el fondo, scroll lock, foco atrapado |
| Global | skip-link "Ir al contenido", foco siempre visible, contraste AA verificado en `clay`/`gold` sobre `ivory`, `prefers-reduced-motion` respetado en todas las animaciones, `alt` obligatorio en imágenes de producto |

### 5.7 Imágenes, copy e i18n

- `ui/primitives/AspectImage.tsx`: exige `width`/`height` (sin CLS), aplica `loading="lazy"` y `decoding="async"` salvo en la imagen LCP, y centraliza la ruta de migración a CDN.
- `app/config/site.ts` define marca, locales `['es-ES']`, moneda y regiones; los textos viven en `features/*/model/copy.ts`. Ningún literal de copy dentro de un componente: añadir `en-GB` en el futuro será añadir un archivo, no refactorizar componentes.

### 5.8 SEO

- Helpers en `lib/seo.ts`: `productHead`, `catalogHead`, `homeHead` (title, description, canonical, Open Graph, Twitter card, `og:image`).
- JSON-LD: `Product` + `Offer` + `BreadcrumbList` en PDP; `ItemList` en listado; `Organization` en la home.
- `routes/api/sitemap[.]xml.ts` genera el sitemap (28 productos + páginas de categoría + estáticas) y `robots[.]txt.ts` el robots.
- Breadcrumbs generados a partir de los `matches` de la ruta (una sola implementación).

---

## 6. Modelo de dominio premium

### 6.1 Tipos base

```ts
export type Brand<T, B extends string> = T & { readonly __brand: B }
export type ProductId = Brand<string, 'ProductId'>
export type VariantId = Brand<string, 'VariantId'>
export type Sku = Brand<string, 'Sku'>
export type CategoryId = Brand<string, 'CategoryId'>
export type CollectionId = Brand<string, 'CollectionId'>
export type ColorId = Brand<string, 'ColorId'>
export type OrderId = Brand<string, 'OrderId'>
```

Los identificadores dejan de ser unions hardcodeados (`data/types.ts:22`, `24`): añadir una categoría deja de ser un cambio de código en tres archivos.

### 6.2 Entidades

```ts
export interface Money { amount: number; currency: Currency }   // amount en unidades menores

export interface MediaAsset {
  url: string; alt: string; width: number; height: number
  type: 'image' | 'video'; focalPoint?: { x: number; y: number }
}

export interface ColorOption { id: ColorId; name: string; hex: string; swatchImage?: string }

export interface ProductVariant {
  id: VariantId; sku: Sku; productId: ProductId
  colorId: ColorId; sizeId?: string
  price: Money; compareAtPrice?: Money
  stock: number; media: MediaAsset[]
  barcode?: string; weightGrams?: number
}

export interface Product {
  id: ProductId; slug: string; name: string
  shortDescription: string; description: string
  categoryId: CategoryId; collectionId?: CollectionId
  brandLine?: string
  price: Money; compareAtPrice?: Money          // precio "desde" (mínimo de variantes)
  variants: ProductVariant[]
  attributes: { materials: MaterialAttribute[]; care?: string[]; dimensions?: string }
  media: MediaAsset[]
  badges: ProductBadge[]                        // 'new' | 'bestseller' | 'limited'
  seo: { title: string; description: string; keywords?: string[] }
  publishedAt: string; updatedAt: string
}

export interface Category {
  id: CategoryId; parentId?: CategoryId; slug: string; name: string
  description: string; editorial: string; heroMedia?: MediaAsset
  position: number; children?: Category[]
}

export interface ShippingOption {
  id: ShippingOptionId; label: string; carrier: string
  etaMinDays: number; etaMaxDays: number
  price: Money; zones: RegionCode[]
}

export type OrderStatus = 'draft' | 'placed' | 'paid' | 'fulfilled' | 'cancelled' | 'refunded'

export interface Order {
  id: OrderId; number: string; status: OrderStatus
  createdAt: string; updatedAt: string
  customer: CustomerSnapshot; shippingAddress: Address; billingAddress: Address
  lines: OrderLine[]; shippingOption: ShippingOptionSnapshot
  totals: { subtotal: Money; discounts: Money; shipping: Money; tax: Money; total: Money }
  payment: { provider: string; reference: string; status: 'pending' | 'authorized' | 'captured' | 'failed' }
  idempotencyKey: string
}
```

### 6.3 Cambios frente al modelo actual

| Actual (`src/data/types.ts`) | Objetivo | Motivo |
|---|---|---|
| `price: number` | `Money` (unidades menores + moneda) | Evita errores de coma flotante y permite multidivisa. |
| `colors: string[]` | `ColorOption[]` + `ProductVariant[]` | Permite swatches, stock por color/talla y SKU. |
| `stock: number` (producto) | `stock` por variante + agregado | Inventario real y reservas. |
| `images: string[]` | `MediaAsset[]` (con `alt`, dimensiones) | Accesibilidad y cero CLS. |
| `CategoryId` union literal | tipo branded + catálogo en datos | Añadir categorías sin tocar código. |
| `featured`, `bestseller`, `isNew` (booleanos) | `badges: ProductBadge[]` + `publishedAt` | Merchandising data-driven, sin flags sueltos. |
| Sin variantes ni SKU | `ProductVariant` completo | Requisito de cualquier e-commerce real. |
| Sin SEO por entidad | `product.seo`, `category.heroMedia` | Control editorial y SEO por página. |

---

## 7. Tooling, calidad y CI

### 7.1 Scripts de `package.json`

```jsonc
{
  "engines": { "node": ">=24" },
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "start": "node dist/server/server.js",          // ← corrige D2 (antes: .output/… inexistente)
    "preview": "vite preview",
    "typecheck": "tsc -b --noEmit",                  // cubre src, configs y tests
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "check:boundaries": "eslint src --rule 'import-x/no-restricted-paths: error'",
    "routes:generate": "tsr generate",
    "verify": "npm run typecheck && npm run lint && npm run test && npm run build"
  }
}
```

### 7.2 TypeScript

`tsconfig.json` (app), `tsconfig.node.json` (configs de build) y `tsconfig.tests.json` (tests), con project references:

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "verbatimModuleSyntax": true,
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@/app/*": ["./src/app/*"],
      "@/features/*": ["./src/features/*"],
      "@/domain/*": ["./src/domain/*"],
      "@/server/*": ["./src/server/*"],
      "@/ui/*": ["./src/ui/*"],
      "@/lib/*": ["./src/lib/*"],
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

Hoy `include: ["src"]` deja `vite.config.ts` y los tests **sin tipar**: eso se corrige con las referencias.

### 7.3 ESLint 9 (flat config) + Prettier

| Regla / plugin | Para qué |
|---|---|
| `typescript-eslint` (type-aware) | `no-explicit-any`, `no-unsafe-*`, `consistent-type-imports`, `no-floating-promises` |
| `eslint-plugin-react-hooks` | Reglas de hooks y dependencias |
| `eslint-plugin-import-x` (`no-restricted-paths`) | **Matriz de dependencias §3.3**: la regla arquitectónica más importante del proyecto |
| `eslint-plugin-testing-library` + `vitest` | Calidad de pruebas |
| `filenames` | `kebab-case` para archivos, `PascalCase` para componentes |
| Prettier integrado (`eslint-config-prettier`) | Formato sin discusiones en revisión |

### 7.4 Testing

| Nivel | Herramienta | Qué cubre | Objetivo |
|---|---|---|---|
| Unitario de dominio | Vitest | `domain/money`, `pricing`, `shipping`, `catalog/query`, `cart-reducer`, `order/transitions` | ≥ 90 % en `src/domain` |
| Componente | Vitest + Testing Library | features críticas: `ProductCard`, `FilterPanel`, `CartDrawer`, `CheckoutForm`, `QuantityStepper` | Estados vacío/error/loading incluidos |
| Integración | Vitest | Server functions contra adaptadores in-memory: filtrado, cotización, `placeOrder`, idempotencia | Casos límite de negocio |
| E2E | Playwright | Embudo completo + teclado + viewports | 1 flujo crítico verde en CI |

**Tests de caracterización (obligatorios en Fase 1):** antes de mover una línea de código se escriben pruebas que fijan el comportamiento **actual** (los 28 productos filtran y ordenan igual, el envío es gratuito a partir de 500 €, etc.). Es la red de seguridad que hace segura toda la migración.

E2E mínimo:

```
1. Home → clic en categoría "Gafas" → /shop/eyewear lista productos filtrados
2. Aplicar filtros (color + material + rango de precio) → la URL cambia y el contador cuadra
3. Ordenar por precio ascendente → primer precio ≤ último precio
4. Abrir PDP → seleccionar color, cantidad 2 → añadir al carrito → drawer abierto
5. Recargar la página → el carrito conserva las 2 unidades (persistencia)
6. Checkout → validación de campos → método Express → el total refleja el envío express
7. Confirmar → pantalla de éxito con número de pedido → el carrito queda vacío
8. Teclado: abrir mega menú, navegar y cerrar solo con teclado
9. Viewports: 1440 · 1280 · 1024 · 768 · 390
```

### 7.5 Git y CI

- `git init` (hoy **no existe** `.git`) → rama `main`, trabajo por ramas cortas, Conventional Commits.
- `.gitignore`: `node_modules`, `dist`, `.tanstack`, `coverage`, `test-results`, `.env`, `.env.*` (salvo `.env.example`), `*.log`, `.DS_Store`.
- `.github/workflows/verify.yml`:
  1. `npm ci`
  2. `npm run typecheck`
  3. `npm run lint`
  4. `npm run test`
  5. `npm run build`
  6. job separado `e2e` con Playwright en PR hacia `main`.
- Hook pre-commit: `npm run verify` (o `lint-staged` + `prettier` si el equipo lo prefiere).
- Renovate/Dependabot para dependencias; `CHANGELOG.md` con Keep a Changelog.

### 7.6 Rendimiento y presupuestos

| Métrica | Presupuesto |
|---|---|
| LCP en móvil limitado (Moto G4 / Fast 3G) | < 2,5 s |
| CLS | < 0,05 |
| INP | < 200 ms |
| JS por ruta de catálogo (gzip) | < 180 kB |
| Imágenes de PDP | dimensionadas, `sizes` correcto, formato moderno |

Mecanismos: `autoCodeSplitting` de rutas, `defaultPreload: 'intent'` (ya configurado en `router.tsx:8`), `ensureQueryData` para SSR sin cascadas, caché HTTP con `stale-while-revalidate` para datos de catálogo, e imágenes con dimensiones explícitas.

---

## 8. Mapeo archivo por archivo

**Cobertura: los 37 archivos de `src/`.** Ninguno queda sin destino.

### 8.1 Raíz y aplicación

| Actual | Destino | Acción / nota |
|---|---|---|
| `src/router.tsx` | `src/app/router.tsx` | Ampliar: `context` con `queryClient`, `defaultPendingComponent`, `defaultErrorComponent`, integración con providers |
| `src/routeTree.gen.ts` | `src/routeTree.gen.ts` | Igual. **Generado**: no editar; se regenera solo |
| `src/styles.css` | `src/app/styles/{tokens,base,utilities,index}.css` | Dividir: `@theme` → tokens; `html/body/::selection` → base; `@custom-variant` + `@utility` → utilities; `index.css` como única importación |
| `src/lib/store.tsx` | `features/cart/model/*` + `features/wishlist/model/*` + `features/account/model/session.ts` + `features/*/model/ui-store.ts` | **Dividir por responsabilidad.** Reducers puros en `domain/cart`; el usuario deja de vivir en el cliente |

### 8.2 Datos → semillas de servidor + dominio

| Actual | Destino | Acción / nota |
|---|---|---|
| `src/data/types.ts` | `src/domain/*/types.ts` + `src/features/*/model/schemas.ts` | Partir por entidad; añadir variantes, `Money`, `MediaAsset`; Zod para fronteras |
| `src/data/products.ts` (28 semillas) | `src/server/seed/products.ts` | Normalizar: variantes con SKU y stock por variante; conservar los 28 productos y sus textos |
| `src/data/categories.ts` | `src/server/seed/categories.ts` + `domain/catalog/category-tree.ts` | Estructura en árbol, sin union hardcodeado |
| `src/data/collections.ts` | `src/server/seed/collections.ts` | Igual, con `position` y media |
| `src/data/shipping.ts` | `src/domain/shipping/*` + `src/server/seed/shipping-options.ts` | Reglas por zona; umbral de envío gratuito como regla de dominio (`FREE_SHIPPING_THRESHOLD`) |
| `src/data/index.ts` | `src/domain/catalog/query.ts` (puro) + `src/server/repositories/in-memory/catalog.in-memory.ts` + `src/features/catalog/{api,model}` | Elimina el **doble ordenamiento** (D3) y la dependencia directa de componentes a mocks |
| `src/data/productLookup.ts` | **Eliminado** | Reemplazado por `CatalogRepository.findByIds` |
| `src/lib/format.ts` | `src/domain/money/*` + `src/lib/money-format.ts` | `formatPrice` pasa a operar sobre `Money` (unidades menores) con moneda y locale desde `app/config/site.ts` (**D17**); `orderNumber()` se mueve al servidor (`server/services/place-order.ts`), donde debe generarse |

### 8.3 Rutas

| Actual | Destino | Acción / nota |
|---|---|---|
| `src/routes/__root.tsx` | `src/routes/__root.tsx` + `src/routes/_storefront.tsx` | El documento y el chrome de tienda se separan; el layout deja de contener la lógica de negocio del header |
| `src/routes/index.tsx` | `src/routes/_storefront.index.tsx` + `features/editorial/components/*` | Extraer Hero, Universos, Destacados, Atelier, Colecciones, Newsletter como componentes del slice |
| `src/routes/shop.tsx` | `_storefront.shop.index.tsx` + `_storefront.shop.$category.tsx` + `features/catalog/**` | Filtros tipados (sin `as never`), facetas desde el servidor, paginación, skeleton, empty y error |
| `src/routes/products.$slug.tsx` | `_storefront.products.$slug.tsx` + `features/product/components/*` | Galería, selector de variantes, disponibilidad por SKU, JSON-LD, relacionados |
| `src/routes/cart.tsx` | `_storefront.cart.tsx` + `features/cart/components/*` | Totales desde `quoteCart` (servidor) |
| `src/routes/checkout.tsx` | `_checkout.checkout.tsx` + `features/checkout/**` | Schema Zod, `placeOrder` idempotente, resumen autoritativo, estados de error de pago |
| `src/routes/login.tsx` | `_account.login.tsx` + `features/account/**` | Sesión en servidor, redirect de retorno, errores reales de credenciales |
| `src/routes/register.tsx` | `_account.register.tsx` + `features/account/**` | Validación Zod compartida con el servidor |
| `src/routes/account.tsx` | `_account.account.tsx` + `features/{account,orders,wishlist}/**` | Guard en `beforeLoad`; historial de pedidos real desde `OrderRepository` |
| `src/routes/wishlist.tsx` | `_storefront.wishlist.tsx` + `features/wishlist/**` | Deja de importar los mock directamente |

### 8.4 Componentes

| Actual | Destino | Acción / nota |
|---|---|---|
| `src/components/layout/Header.tsx` | `src/ui/patterns/Header.tsx` + `src/features/navigation/components/HeaderContainer.tsx` | Presentación por props en `ui`; datos y estado en la feature |
| `src/components/layout/Footer.tsx` | `src/ui/patterns/Footer.tsx` | Newsletter como feature/action con server function (sin backend falso) |
| `src/components/layout/MegaMenu.tsx` | `src/features/navigation/components/{MainNav,MegaMenu,MegaMenuPanel}.tsx` + `src/features/navigation/model/nav-sections.ts` | Arregla **D1**; navegación por teclado; enlaces tipados con `to` + `search` |
| `src/components/layout/MobileMenu.tsx` | `src/features/navigation/components/MobileMenu.tsx` | Focus trap, scroll lock, `inert` en el fondo |
| `src/components/layout/SearchOverlay.tsx` | `src/features/search/components/{SearchOverlay,SearchResults}.tsx` + `src/features/search/api/search.server.ts` | Búsqueda en servidor, URL `/search?q=`, estados vacío/error, a11y de diálogo |
| `src/components/product/ProductCard.tsx` | `src/features/catalog/components/ProductCard.tsx` | Variantes y disponibilidad reales; badge desde `product.badges` |
| `src/components/product/ProductGrid.tsx` | `src/features/catalog/components/ProductGrid.tsx` | Grid accesible, `ItemList` JSON-LD, skeleton |
| `src/components/cart/CartDrawer.tsx` | `src/features/cart/components/CartDrawer.tsx` | Totales del `quoteCart`; a11y de diálogo |
| `src/components/cart/CartSummary.tsx` | `src/features/cart/components/CartSummary.tsx` | Un solo componente de resumen reutilizado por carrito y checkout (hoy el resumen está duplicado en `cart.tsx` y `checkout.tsx`) |
| `src/components/ui/Button.tsx` | `src/ui/primitives/Button.tsx` + `src/ui/primitives/ButtonLink.tsx` | Separar botón de enlace tipado (`to` + `params` + `search`), eliminando `to?: string` (**D8**) |
| `src/components/ui/Badge.tsx` | `src/ui/primitives/Badge.tsx` | Variantes tipadas (`new`, `bestseller`, `limited`, `soldout`, `sale`) |
| `src/components/ui/Drawer.tsx` | `src/ui/primitives/Drawer.tsx` | `role="dialog"`, `aria-modal`, focus trap, restauración de foco, scroll lock compartido (**D9**) |
| `src/components/ui/EmptyState.tsx` | `src/ui/patterns/EmptyState.tsx` | `Link` tipado en vez de `<a href>` (**D8**) |
| `src/components/ui/QuantitySelector.tsx` | `src/ui/primitives/QuantityStepper.tsx` | Respeta `min`/`max` y **stock disponible**; accesible |
| `src/components/ui/SectionHeading.tsx` | `src/ui/patterns/SectionHeading.tsx` | Usa `@utility eyebrow`; acción tipada |

### 8.5 Artefactos

| Actual | Acción |
|---|---|
| `dist/` | Añadir a `.gitignore`; borrar del árbol de trabajo y regenerar con `npm run build` |
| `.tanstack/` | Añadir a `.gitignore` (es el `tmpDir` del generador de rutas) |
| `Prompt — E-commerce premium….md` | Mantener como referencia: mover a `docs/brief-original.md` y conservar tal cual |

---

## 9. Plan por fases

> **Regla transversal (heredada del brief original):** no se avanza de fase con funcionalidad rota. Cada fase termina con `npm run verify` en verde y el embudo E2E funcionando.

### Fase 0 — Cimientos (sin mover código de negocio)

**Objetivo:** poder cambiar el proyecto con seguridad.

1. `git init`, `.gitignore` completo, `README.md`, primer commit del estado actual (punto de retorno).
2. Tooling: `eslint.config.js` (flat), `.prettierrc`, `vitest.config.ts`, `playwright.config.ts`.
3. `package.json`: `engines.node >= 24`, scripts de §7.1, **corrección del script `start`**.
4. `tsconfig` con project references y flags estrictos. Las infracciones existentes se aíslan en una allowlist **con fecha de caducidad** (a cero al final de la Fase 3).
5. `.env.example` + `app/config/env.ts` (validación Zod).
6. CI `verify.yml` (sin e2e todavía) y hook pre-commit.
7. `docs/conventions.md` inicial (nomenclatura, plantillas, reglas).

**Criterio de salida:** `npm run verify` verde; `npm run build && npm start` sirve la aplicación completa; el repositorio tiene historial y CI.

### Fase 1 — Núcleo puro (`domain/`, `lib/`)

**Objetivo:** extraer toda la lógica de negocio a funciones puras **sin tocar la UI**.

1. `domain/money` + `lib/money-format` (unidades menores, `Intl.NumberFormat`, sustituye `lib/format.ts`).
2. `domain/catalog/query`: filtrado, orden, facetas, paginación — portando exactamente el comportamiento de `data/index.ts`.
3. `domain/pricing` y `domain/shipping`: subtotal, umbral de envío gratuito, envío por método, total.
4. `domain/cart`: reducer puro + selectores (portando `store.tsx`).
5. `domain/order`: entidad, estados y transiciones válidas.
6. **Tests de caracterización** de todo lo anterior (los 28 productos, mismos filtros, mismos totales que hoy).
7. `lib/result.ts`, `lib/cn.ts`, `lib/storage.ts`.

**Criterio de salida:** el 100 % del comportamiento actual de catálogo, precios y carrito está reproducido por funciones puras cubiertas por tests, y la UI sigue funcionando sin cambios.

### Fase 2 — Backend en el mismo árbol (`server/`, `*.server.ts`)

**Objetivo:** que el navegador deje de decidir.

1. `server/seed/*` normalizado desde `src/data/*` (variantes, SKU, stock por variante, categorías en árbol).
2. Puertos (`*.port.ts`) y adaptadores in-memory; `server/runtime/container.ts`.
3. `server/runtime/{middleware,session,errors,logger}.ts`.
4. Server functions: `listProducts`, `getProductBySlug`, `listFacets`, `listCategories`, `searchProducts`, `quoteCart`, `placeOrder`, `login`, `register`, `logout`, `getSession`, `listWishlist`, `toggleWishlist`, `listOrders`.
5. `server/services/*`: `quote-cart`, `place-order`, `reserve-inventory`, `send-order-notification` (stub).
6. Server routes: `api/health`, `api/sitemap[.]xml`, `api/robots[.]txt`.
7. Sustituir gradualmente cada acceso directo a `@/data` por la server function correspondiente, empezando por el catálogo y terminando por el checkout.
8. Retirar el usuario de `localStorage` y pasar la sesión al servidor.

**Criterio de salida:** ningún componente importa `@/server/**` ni `@/data/**`; el bundle de cliente no contiene código de servidor (verificado); los totales mostrados provienen de `quoteCart`; `placeOrder` funciona con idempotencia y crea pedidos recuperables en `/account`.

### Fase 3 — Frontend por features (`ui/`, `features/*`, `routes/`)

**Objetivo:** legibilidad y fronteras.

1. Design system: tokens, `@utility`, `@custom-variant group-nav`, primitives accesibles.
2. Migración slice por slice, en este orden: `catalog` → `product` → `cart` → `checkout` → `account`/`orders` → `search` → `navigation` → `editorial`.
3. Rutas delgadas + layouts pathless (`_storefront`, `_checkout`, `_account`) + `pendingComponent`/`errorComponent`/`notFoundComponent` en todas las rutas de datos.
4. Search params con Zod (`shopSearchSchema`).
5. Copy a `model/copy.ts`; `app/config/site.ts`.
6. Pasada de accesibilidad completa (foco, teclado, contraste, `prefers-reduced-motion`).
7. Borrar `src/data/**`, `src/lib/store.tsx`, `src/lib/format.ts` y `components/**` cuando cada slice esté completo y probado.
8. Allowlist de TypeScript y ESLint a **cero**.

**Criterio de salida:** cero `any`, cero `as never`, cero `to="…?query"`, cero imports a `@/data`, cero cadenas de estilo duplicadas; mega menú funcional y operable por teclado; todas las rutas con estados completos.

### Fase 4 — Calidad premium

1. SEO: helpers, canonical, OG, JSON-LD (`Product`+`Offer`+`BreadcrumbList`+`ItemList`), `sitemap.xml`, `robots.txt`.
2. Imágenes: `AspectImage` en todas las superficies, dimensiones explícitas, prioridad del LCP.
3. Rendimiento: medición contra los presupuestos de §7.6 y ajustes (code splitting, caché, preload).
4. E2E completo (§7.4) + auditoría `axe` + matriz de viewports 1440/1280/1024/768/390.
5. Pulido de estados vacíos, errores, skeletons y microinteracciones (criterio del brief: "lujo silencioso").
6. Analítica y trazas mínimas con puntos de extensión definidos (sin PII).

**Criterio de salida:** embudo E2E verde en CI; sin incidencias críticas/serias de accesibilidad; presupuestos de rendimiento cumplidos.

### Fase 5 — Escalabilidad y handover

1. `docs/architecture.md` (árbol, matriz, fronteras), `docs/runbook.md`, ADRs 0001–0008.
2. Playbook `packages/*` (§3.5) listo para ejecutarse cuando aparezca un segundo consumidor.
3. Plan de persistencia real: esquema Postgres + Drizzle (o adaptador Medusa/Shopify) con el mapeo desde los puertos actuales.
4. Plan de i18n y multidivisa (segundo locale, precios por región, impuestos por país).
5. Plan de pagos reales (Stripe + webhook + conciliación) y de emails transaccionales.
6. Feature flags y experimentación; checklist de onboarding para nuevos ingenieros.

**Criterio de salida:** un ingeniero nuevo levanta el proyecto y hace un cambio completo de punta a punta usando solo `docs/`.

### Esfuerzo relativo

| Fase | Peso relativo | Paralelizable |
|---|---|---|
| 0 · Cimientos | 5 % | No (bloquea todo) |
| 1 · Dominio | 15 % | Sí, con 2 · Backend |
| 2 · Backend | 30 % | Parcialmente con 1 |
| 3 · Frontend | 30 % | Sí, por slices |
| 4 · Calidad | 15 % | Sí |
| 5 · Handover | 5 % | Sí |

---

## 10. Registro de defectos a corregir

| ID | Defecto | Evidencia | Fase | Criterio de verificación |
|---|---|---|---|---|
| **D1** | El mega menú nunca se muestra: la variante Tailwind `group-nav:` no está declarada | `components/layout/MegaMenu.tsx:83`, `Header.tsx:42`, `styles.css` (sin `@custom-variant`) | 3 | Abrir el menú en escritorio y con teclado; el panel es visible (`display: block`) |
| **D2** | `npm start` apunta a un archivo inexistente: el build genera `dist/server/server.js`, no `.output/server/index.mjs` | `package.json:8`; `dist/server/server.js` existe, `.output` no | 0 | `npm run build && npm start` sirve la app en el puerto 3000 |
| **D3** | Doble ordenamiento del catálogo | `routes/shop.tsx:87-97` junto a `data/index.ts:95` | 2 | Una sola llamada de orden en el pipeline, con test que lo fije |
| **D4** | Parámetros de búsqueda sin validar: `?category=foo` devuelve catálogo vacío en silencio | `routes/shop.tsx:31-58` | 3 | `shopSearchSchema` con `.catch()`; URL inválida muestra el catálogo completo o un aviso, nunca vacío mudo |
| **D5** | Dos fuentes de verdad para el total (envío estándar vs. método elegido) | `lib/store.tsx:103-104` vs `routes/checkout.tsx:40-41` | 2 | Test: total de drawer = total de carrito = total de checkout para estándar y express |
| **D6** | Login acepta cualquier contraseña (≥4 caracteres) y guarda el usuario en `localStorage`; `/account` sin guard | `routes/login.tsx:19-31`, `lib/store.tsx:75-83`, `routes/account.tsx:13` | 2 | Credenciales inválidas fallan en servidor; sesión en cookie `httpOnly`; `/account` redirige sin sesión |
| **D7** | No existe backend: el pedido se crea en memoria del navegador y se pierde | `routes/checkout.tsx:63-76` | 2 | `placeOrder` en servidor; el pedido aparece en `/account` tras recargar |
| **D8** | Navegación sin tipos: `Button` con `to?: string`, `<a href>` en `EmptyState`, URLs con query string en varios sitios | `ui/Button.tsx:10,38-44`, `ui/EmptyState.tsx:13`, `routes/index.tsx:106,162`, `MegaMenu.tsx` | 3 | ESLint/TS fallan si un enlace no está tipado; cero `to="…?…"` |
| **D9** | Diálogos sin semántica ni gestión de foco; menú móvil sin bloqueo de scroll | `ui/Drawer.tsx` (completo), `MobileMenu.tsx:11-25` | 3 | `role="dialog"` + `aria-modal` + focus trap + Escape + restauración de foco; axe sin incidencias |
| **D10** | Duplicación masiva de utilidades de estilo | `text-[11px] uppercase tracking-[0.25em] text-taupe` en 12+ archivos | 3 | `@utility eyebrow` (y resto) usadas en su lugar; grep devuelve 0 coincidencias del patrón crudo |
| **D11** | Sin control de versiones | no existe `.git` | 0 | `git log` con historial y CI activa en PR |
| **D12** | Artefactos de build versionables: `dist/` y `.tanstack/` no ignorados; `.output` ignorado pero nunca generado | `.gitignore` (3 líneas) | 0 | `.gitignore` cubre `dist`, `.tanstack`, `coverage`, `test-results` |
| **D13** | Sin pruebas, sin lint, sin formato, sin CI | ausencia total de configuración | 0–4 | `npm run verify` en CI en cada PR |
| **D14** | `stock` a nivel de producto y sin variantes: imposible vender tallas/colores con inventario propio | `data/types.ts:4-20` | 2 | `ProductVariant` con SKU y stock por variante; reserva al pedir |
| **D15** | Categoría como union literal: añadir una categoría exige tocar 3 archivos | `data/types.ts:22`, `data/categories.ts`, `shop.tsx` | 2 | Tipo branded + categorías en datos; añadir una categoría no requiere código de tipos |
| **D16** | SEO incompleto: sin canonical, sin JSON-LD, sin sitemap ni robots | `routes/__root.tsx:15-40` (solo meta básica) | 4 | Canonical + JSON-LD válidos; `sitemap.xml` con 28 productos y páginas de categoría |
| **D17** | Cálculo de precio/format sin moneda configurable | `lib/format.ts:1-7` (EUR y locale fijos) | 1 | `Money` + `Intl` configurados desde `app/config/site.ts` |
| **D18** | `QuantitySelector` ignora el stock disponible (máximo fijo 10) | `ui/QuantitySelector.tsx:12` | 3 | El máximo se limita a la disponibilidad del SKU |
| **D19** | Sin estados de carga por ruta: la navegación a `/shop` o PDP no muestra esqueleto | ninguna ruta define `pendingComponent` | 3 | Todas las rutas de datos tienen `pendingComponent` |
| **D20** | Sin `.env` ni validación de entorno; sin `engines` | ausencia de `.env.example` y `engines` | 0 | `env.ts` valida y falla al arrancar si falta una variable |

---

## 11. Riesgos y mitigaciones

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| Refactor destructivo ("big bang") | Media | Alto | Estrategia **strangler**: lo antiguo sigue en pie hasta que su slice está completo y probado; el mapeo §8 garantiza cobertura 1:1; borrado solo al cierre de cada slice. Commits pequeños y `git` desde la Fase 0. |
| Regresión silenciosa en precios, filtros o totales | Alta | Alto | **Tests de caracterización en Fase 1**, antes de mover código. Sin excepción. |
| Fuga de código de servidor al bundle cliente | Media | Alto | `createServerOnlyFn` (rompe el build) + regla ESLint de fronteras + comprobación de `dist/client/assets` como paso del checklist de PR. |
| Pérdida del carrito de usuarios existentes | Baja | Medio | Clave versionada `ml.cart.v2` + migración explícita desde `ml.cart.v1`. |
| Ruido por estrictez de TypeScript | Alta | Bajo | Allowlist temporal con fecha de caducidad, a cero al final de la Fase 3. No se relajan los flags. |
| Cambios de URL con pérdida de SEO | Media | Medio | Se conservan las URLs actuales como canónicas; `/shop/:category` es **aditivo**; sin redirecciones rotas. |
| Duplicación temporal de código (viejo + nuevo) | Alta | Bajo | Cada slice se borra al terminar; checklist de PR pregunta explícitamente "¿qué archivo antiguo elimina este PR?". |
| Coste de mantener dos mentalidades durante la migración | Media | Medio | `docs/conventions.md` como fuente única; plantillas de archivo copiables; la matriz §3.3 la aplica ESLint, no la memoria. |
| Bloqueo por decisiones de producto (pagos, CMS, DB) | Media | Medio | Los puertos y adaptadores permiten decidir más tarde sin tocar la UI; Fase 5 documenta el mapeo. |
| Adopción a medias (nadie ejecuta las fases) | Media | Alto | Entregables por fase con criterio binario de salida y CI obligatoria; cada fase produce valor desplegable. |

---

## 12. Definition of Done y criterios de aceptación

### 12.1 DoD por tarea

- [ ] Tipado estricto, sin `any` ni `as` injustificados.
- [ ] Fronteras respetadas (ESLint de límites en verde).
- [ ] Tests unitarios para la lógica de dominio nueva o modificada.
- [ ] Estados vacío / carga / error contemplados en la UI.
- [ ] Accesible por teclado y con foco visible.
- [ ] `npm run verify` en verde.
- [ ] Los archivos antiguos que reemplaza han sido eliminados.

### 12.2 Criterios de aceptación de la reestructuración

1. **Build y arranque:** `npm run build && npm start` sirve la aplicación completa en el puerto 3000.
2. **Verificación:** `npm run verify` (typecheck + lint + test + build) verde.
3. **E2E:** `npm run test:e2e` pasa el embudo completo: home → categoría → filtros → orden → PDP → variante + cantidad → carrito → **recarga con persistencia** → checkout → validación → envío express → orden creada → carrito vacío.
4. **Fronteras:** ESLint sin excepciones y `src/server/**` ausente de todo chunk de `dist/client`.
5. **Limpieza:** cero `any`, cero `as never`, cero `to="…?query"`, cero imports a `@/data`, `src/data/**` y `src/lib/store.tsx` no existen.
6. **Una sola verdad para el dinero:** los totales de drawer, carrito y checkout provienen de `quoteCart` y coinciden en todos los casos (estándar/express, umbral de envío gratuito cruzado, carrito vacío, producto agotado, cantidad superior al stock).
7. **Inventario por variante:** vender una variante descuenta su stock, no el del producto; agotar una talla no agota el resto.
8. **Sesión:** login/registro funcionan contra el servidor; `/account` redirige sin sesión; no hay datos de usuario en `localStorage`.
9. **Pedidos:** el pedido creado es recuperable en `/account` y sobrevive a recargar y a reiniciar el servidor (dentro del alcance del adaptador in-memory: al menos durante la sesión del proceso).
10. **Accesibilidad:** axe sin incidencias críticas/serias en las 9 rutas; mega menú, drawers y overlays operables solo con teclado; `prefers-reduced-motion` respetado.
11. **Estados:** todas las rutas de datos tienen estados de carga, vacío, error y no-encontrado.
12. **SEO:** canonical y JSON-LD válidos en PDP; sitemap con 28 productos y páginas de categoría; `robots.txt` servido.
13. **Rendimiento:** presupuestos de §7.6 cumplidos en móvil limitado.
14. **Consistencia visual:** ninguna cadena de estilo repetida; cambios de marca vía tokens; el sistema visual del brief original se mantiene intacto.
15. **Documentación:** `docs/architecture.md`, `docs/conventions.md`, `docs/runbook.md` y ADRs 0001–0008 publicados.

---

## 13. Anexos

### 13.1 Dependencias a añadir

| Paquete | Versión | Tipo | Justificación |
|---|---|---|---|
| `@tanstack/react-query` | ^5 | dep | Estado de servidor, caché, `ensureQueryData` en loaders. Exigido por el stack del brief original. |
| `vitest` + `@vitest/coverage-v8` | ^3 | dev | Runner de pruebas compartiendo configuración con Vite. |
| `@testing-library/react` + `@testing-library/user-event` + `jsdom` | últimas | dev | Pruebas de componente orientadas a comportamiento. |
| `@playwright/test` | ^1 | dev | E2E y matriz de viewports. |
| `eslint` ^9 + `typescript-eslint` + `eslint-plugin-import-x` + `eslint-plugin-react-hooks` + `eslint-config-prettier` | últimas | dev | Lint, type-aware y **fronteras de arquitectura**. |
| `prettier` | ya presente (3.9.6) | dev | Formato (declararlo explícitamente como dependencia directa). |
| `zod` | ya presente (4.6.5) | dep | Validación de fronteras; **promoverlo a dependencia directa**. |

### 13.2 Dependencias que **no** se añaden

| Descartada | Motivo |
|---|---|
| `tsdx` | Sin mantenimiento; es para librerías, no para apps. Se adoptan sus principios (§2). Su equivalente moderno (`tsup`) solo se usará si se publica un paquete. |
| `zustand`, `jotai`, `redux` | El estado de cliente es pequeño y acotado a carrito/wishlist/UI; reducers puros en `domain/` son testeables sin dependencias. |
| `clsx`, `tailwind-merge`, `cva` | `cn()` en `lib/cn.ts` con 5 líneas cubre la composición de clases. |
| `jest` | Vitest comparte pipeline con Vite y una sola configuración. |
| `axios` | Las server functions del framework cubren la capa de transporte; cero `fetch` manual en componentes. |
| `lerna` / `turborepo` | Solo tendrían sentido al extraer `packages/*` (Fase 5), no antes. |

### 13.3 Glosario

| Término | Significado en este documento |
|---|---|
| **PLP / PDP** | Product Listing Page (listado/categoría) / Product Detail Page (ficha de producto). |
| **Server function** | Función declarada con `createServerFn` que se ejecuta en el servidor y se invoca desde el cliente con tipos compartidos. |
| **Server route** | Endpoint HTTP declarado en `src/routes/api/*` (sitemap, health, webhooks). |
| **Puerto / adaptador** | Interfaz de acceso a datos (puerto) e implementación concreta intercambiable (adaptador). |
| **Vertical slice** | Carpeta de feature que contiene todo lo necesario para una capacidad de negocio, con API pública propia. |
| **Unidades menores** | Importes en céntimos como enteros (evita errores de coma flotante). |
| **Idempotencia** | Propiedad por la que repetir la misma operación no duplica el efecto (clave `idempotencyKey` en pedidos). |
| **Strangler** | Estrategia de migración incremental en la que el sistema nuevo reemplaza al viejo pieza a pieza, sin detener el servicio. |
| **Pathless route** | Ruta que agrupa hijos con un layout compartido sin añadir segmento a la URL (prefijo `_` en TanStack Router). |
| **Faceta** | Conjunto de valores filtrables con su conteo (color, material, precio). |
| **CLS / LCP / INP** | Métricas de experiencia de usuario: estabilidad visual, carga del elemento principal y respuesta a la interacción. |

### 13.4 Variables de entorno (`.env.example`)

```dotenv
# Fuente de datos: in-memory | postgres | shopify | medusa
DATA_SOURCE=in-memory

# URL pública del sitio (canonical, sitemap, Open Graph)
PUBLIC_SITE_URL=http://localhost:3000

# Secreto de firma de sesión (mínimo 32 caracteres)
SESSION_SECRET=cambiar-este-valor-en-produccion-32chars-minimo

# Pasarela de pagos: fake | stripe
PAYMENTS_PROVIDER=fake

# Proveedor de imágenes: picsum | cdn
MEDIA_PROVIDER=picsum
```

### 13.5 ADRs a redactar en Fase 5

| ADR | Decisión |
|---|---|
| 0001 | Un solo árbol `src/` con backend embebido (server functions) en lugar de frontend/backend separados. |
| 0002 | Adopción de los principios de TSDX sin la herramienta; equivalencias modernas. |
| 0003 | Arquitectura por capas + vertical slices y matriz de dependencias impuesta por ESLint. |
| 0004 | Dinero en unidades menores y precios como autoridad exclusiva del servidor. |
| 0005 | Puertos y adaptadores para datos, pagos y hashing; adaptadores in-memory primero. |
| 0006 | Estado: TanStack Query para servidor, reducers puros + context para cliente, URL para filtros. |
| 0007 | Design system con tokens CSS y `@utility` de Tailwind 4; sin librerías de clases. |
| 0008 | Estrategia de accesibilidad y presupuestos de rendimiento como requisitos de aceptación. |

---

## 14. Checklist de PR y reglas de oro

### 14.1 Checklist de PR

- [ ] ¿El archivo nuevo vive en la capa correcta según §3.2?
- [ ] ¿Solo se importa API pública de otras features (`index.ts`)?
- [ ] ¿El componente de cliente toca `@/server/**` directa o indirectamente? (Debe ser **no**; solo `*.server.ts`.)
- [ ] ¿La ruta nueva es delgada (< 80 líneas, sin lógica de negocio)?
- [ ] ¿Los datos se cargan por loader con `ensureQueryData`, sin `useEffect` de fetch?
- [ ] ¿Toda entrada externa (search params, formularios, server functions) se valida con Zod?
- [ ] ¿Los importes usan `Money` (unidades menores) y vienen del servidor?
- [ ] ¿Hay estados de carga, vacío, error y no-encontrado?
- [ ] ¿Es operable con teclado y tiene foco visible?
- [ ] ¿Hay tests de la lógica nueva?
- [ ] ¿Qué archivos antiguos elimina este PR?
- [ ] ¿`npm run verify` está en verde?

### 14.2 Reglas de oro

1. **`domain` no conoce a nadie.** Si toca React, red o framework, no es dominio.
2. **El servidor decide, el cliente pinta.** Precios, stock, totales y permisos nunca se calculan en el navegador.
3. **Toda frontera se valida.** Zod en search params, formularios, server functions y variables de entorno.
4. **Una feature, una API pública.** Lo interno es privado; el import cruzado entra por `index.ts`.
5. **Nada de literales de copy ni de estilo en los componentes.** Copy en `model/copy.ts`, estilos en tokens y `@utility`.
6. **Si lo repites tres veces, es un primitivo.** Va a `ui/primitives` o a `domain`.
7. **Prohibido `any`, `as never` y enlaces sin tipos.** El compilador es el primer revisor.
8. **Un cambio de datos no debe tocar componentes.** Si conectar una API real obliga a editar la UI, la frontera está mal puesta.
9. **Cada fase termina verde.** No se avanza con el embudo roto.
10. **Sin tests no hay refactor.** Los tests de caracterización son el contrato con el comportamiento actual.

### 14.3 Decisiones fijadas (para evitar preguntas durante la implementación)

| Tema | Decisión | Motivo |
|---|---|---|
| Carpeta de backend | `src/server/**` + `features/*/api/*.server.ts` | Un solo árbol, como pide el encargo; el framework es full-stack. |
| URLs | Se conservan las actuales; se **añade** `/shop/:category`, `/search` | Cero regresiones de SEO y de enlaces existentes. Se documenta la desviación respecto a `/product/:slug` del brief original. |
| Gestor de paquetes | npm | Ya existe `package-lock.json`; migrar a pnpm se evalúa en Fase 5. |
| Persistencia | In-memory tras puertos en Fases 2–4 | Permite avanzar sin decidir la base de datos; el cambio queda en `container.ts`. |
| Estado | TanStack Query (servidor) + reducers puros y context (cliente) + URL (filtros) | Sin dependencias innecesarias y con lógica testeable. |
| Pagos | Puerto `PaymentGateway` con adaptador simulado | Mantiene el alcance actual ("pago simulado") con la arquitectura lista para Stripe. |
| Internacionalización | Un solo locale (`es-ES`), estructura i18n-ready | Cumple el alcance actual sin coste de traducciones. |
| Tema oscuro | Fuera de alcance | No está en el brief; los tokens lo permitirían después. |

---

**Fin del documento.** Cualquier cambio en la arquitectura aquí descrita debe registrarse como ADR en `docs/adr/` y actualizar este `plan.md` en el mismo PR.
