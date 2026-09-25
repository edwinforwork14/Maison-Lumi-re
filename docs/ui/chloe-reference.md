# Ficha de referencia UI/UX — Chloé (Plan 04)

> Fuente: `plans/04_PLAN_UI_UX_CHLOE.md` §1 y §2 (valores medidos del HTML/CSS servido por
> `www.chloe.com/es-es/c/eyewear/chloe-iconic`). Página de **estructura**, no de contenido: el
> contenido sigue siendo el de Maison Lumière. Consultar durante la implementación de F1–F5.

---

## 1. Design tokens medidos

### 1.1 Tipografía

| Token | Valor | Nota |
|---|---|---|
| Familia | `futura, helvetica, arial, sans-serif` | Futura Now Text (Monotype, comercial); **sustituto declarado: `Jost` 400/500** (opción B, §1.6 del plan) |
| `--fs-base-font` | `.938rem` = **15 px** | Raíz efectiva |
| Tracking global | `.031rem` ≈ 0.5 px | — |
| `.t-body` | **13 px / 1.3846 / 400** | Cuerpo base de toda la PLP |
| `.t-body-strong` | 13 px / 1.3846 / **500** | Títulos de modal, énfasis |
| `.editorial-row__title` | **uppercase**, `letter-spacing: -.03em`, **23 px / 1 / 500**; ≥768 px: **31 px** | Título editorial de PLP |
| `.editorial-text-row__title` | 17 px / 1 / 500 uppercase `-.03em`; ≥768: 23 px | Variante secundaria |
| `.price` | 13 px / 1.3846 / 400, `inline-flex`, `gap: 8px` | Precio de tarjeta |

**Regla práctica:** texto a 14/16/18 px está mal. Cuerpo **13 px**, título editorial **23/31 px**,
tracking negativo `-.03em` obligatorio en títulos. **Chloé no usa serif**: `Cormorant Garamond` se elimina.

### 1.2 Color

| Token Chloé | Valor | Token Maison (§6 del plan) |
|---|---|---|
| `--white` | `#fff` | `--color-surface` |
| `--off-white` | `#f9f9f9` | `--color-surface-off` |
| `--beige-50` (`--bg-subtle`) | `#f8f7f5` | `--color-subtle` — fondo de tarjeta/acordeón/modal |
| `--beige-100` | `#ede9e3` | `--color-subtle-hover` |
| `--grey-10` (`--border-decorative`) | `#e5e5e5` | `--color-line` — borde por defecto |
| `--grey-20` | `#cecece` | `--color-line-light` |
| `--grey-33` | `#a8a8a8` | `--color-line-medium` |
| `--grey-60` | `#717171` | `--color-text-secondary` |
| `--grey-90` (`--text-primary`) | `#0a0a0a` | `--color-text-primary` |
| `--black` | `#000` | `--color-black` |
| `--gold` | `#8f7144` | `--color-gold` |
| `--red` | `#b32` | `--color-danger` |
| `--bg-frost` | `rgba(255,255,255,.95)` | `--color-frost` |
| `--bg-frost-transparent` | `rgba(255,255,255,.7)` | `--color-frost-transparent` |
| `--bg-frost-inverse` | `rgba(0,0,0,.95)` | `--color-frost-inverse` |
| `--bg-overlay` | `rgba(0,0,0,.2)` | `--color-overlay` |
| `--border-frost` | `rgba(255,255,255,.2)` | `--color-border-frost` |

> Los tokens cálidos actuales (ivory/sand/linen/clay/taupe/charcoal/ink) se sustituyen por esta paleta
> neutra; los alias antiguos apuntan a los nuevos valores durante la transición (se eliminan en F7).

### 1.3 Formas, sombras y movimiento

| Token | Valor |
|---|---|
| `--border-radius-default` | `4px` |
| `--border-radius-full` | `9999px` |
| `--box-shadow-frost` | `0 0 1px 0 rgba(0,0,0,.15), 0 1px 4px 0 rgba(0,0,0,.05)` |
| `--backdrop-blur-default` | `10px` |
| `--easing-custom` | `cubic-bezier(.23,1,.32,1)` |
| Aspectos | retrato `3/4`, apaisado `16/9`, cuadrado `1/1` |
| Acordeón | `all .4s var(--easing-custom)`; contenido `opacity .15s linear` |
| Modal centrado / lateral | `transform .3s` (`translateY(100%)→0` / `translateX(100%)→0`) |
| Toaster / isla | `transform .15s` (toaster `translateY(-101%)→0`) |
| Hover enlace de tarjeta | `color .25s` |
| Hover botón | `background-color .3s` |
| Cross-fade de imagen | `opacity .25s` |

### 1.4 Rejilla, espaciado y breakpoints

| Token | Valor |
|---|---|
| `--outer-gutter` | 20 px |
| `--inner-gutter` | 40 px |
| `--grid-columns` (desktop) | 24 |
| `--spacing-block` | 64 px móvil → **96 px ≥768 px** |
| `--spacing-tight-block` | 48 → 64 px |
| `--spacing-header` | 48 → 56 px |
| `--spacing-main` | 96 → 192 px |
| Escala | 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 48, 64, 96 px |
| Breakpoints | adoptamos los de Tailwind: `md: 768 px`, `lg: 1024 px` (desviación consciente de 1 px) |

### 1.5 Componentes medidos

| Componente | Medidas |
|---|---|
| `.button` | `padding: 12px 20px`, `min-height: 48px`, `radius: 4px`, `font: 13px/1.3846`, `gap: 12px`, `inline-flex`, transición `background-color .3s` |
| `.button--primary` | `bg rgba(0,0,0,.95)`, `color #fff`, sombra frost, blur 10 px |
| `.button--secondary` | `border 1px #0a0a0a`, `bg #fff`, `text #0a0a0a`; disabled: `color #717171`, `border #cecece` |
| `.button--frost` | `bg rgba(255,255,255,.95)`, `border 1px rgba(255,255,255,.2)`, blur 10 px, sombra frost; hover `rgba(255,255,255,.7)` |
| `.accordion__item` | `bg #f8f7f5`, `radius 4px` |
| `.accordion__trigger` | `padding 12px 20px`, `13px/1.3846/400`; abierto → **500** |
| `.accordion__content-inner` | `padding 0 20px 20px` |
| `.form-checkbox` / radio | `padding 8px 0`, label 13 px con `padding-left 24px`, icono 16 px borde `#a8a8a8`, checked → relleno `#0a0a0a` |
| `.modal__container` | `bg rgba(255,255,255,.95)`, blur 10 px, `radius 4px`, sombra frost, `overflow hidden` |
| `.modal__header` | `padding 20px`, espacio entre título y cierre |
| `.island` | `fixed`, `left/right 20px`, `bottom 0`, `padding-bottom 24px`, `gap 8px`, centrada, `transition transform .15s` |
| Tarjeta (`.product-card`) | imagen `aspect-ratio 3/4`, `bg #f8f7f5`, `object-fit cover`; `.product-card__info`: `flex column`, `gap 12px`, **`padding 12px 20px 32px`**, `font-size 13px` |
| `.breadcrumb` | `flex wrap`, `gap 4px`, 13 px, sin bordes ni padding |
| `.toaster` | `fixed top 0`, `padding 16px 20px`, entra `translateY(-101%)→0` |
| `.footer` | `margin-top 96px`, `border-top 1px #e5e5e5`; `.footer__cols`: `flex wrap`, `column-gap 40px`, `row-gap 48px`; `.footer__list`: `flex column`, `gap 4px`, `margin-top 12px`; copyright `margin-top 96px`, `padding-bottom 32px`; `.footer__currency`: 10 px, `bg #f8f7f5`, `padding 8px`, `radius 4px` |

---

## 2. Blueprint de la PLP (orden exacto de bloques)

1. **Franja de anuncios** (`.top-strip`): ancho completo, mensajes en rotación con fundido
   (`data-auto-scroll`), botón de cierre con `aria-label`. Texto 13 px centrado.
2. **Cabecera** (tres zonas): izquierda botones **«Menú»** y **«Buscar»** (texto + icono); centro logo
   centrado; derecha wishlist y carrito con contador **dentro** del botón. Altura `3.375rem` (móvil) /
   `5rem` (desktop). **Sin navegación horizontal ni mega menú por hover.**
3. **Modal de menú** (pantalla completa): cabecera «atrás» + título, búsqueda embebida, grupos de
   navegación (encabezado + «Ver todo» + sub-listas + `CATEGORÍAS` + `Explorar las líneas` + bloques
   editoriales), pie: `Iniciar sesión`, `Contáctenos`, `Nuestras tiendas`, `Cambiar país / idioma`.
4. **Modal de líneas/colecciones** (`#modal-lines`): título + cierre; rejilla **3 columnas** de tarjetas
   con imagen 3/4 (`object-fit: contain`) y nombre centrado 13 px `#717171`.
5. **Banner a sangre** (`.full-bleed-banner`): sin gutter, sin texto; `<picture>` 4/5 (<1024 px) y 16/9 (≥1024).
6. **Bloque editorial** (`.editorial-row`): `h2` **uppercase 23/31 px, `-.03em`, peso 500**, ancho 6/24;
   descripción 13 px **a la derecha del título**, en desktop arranca en la columna 9 con `width 8/24`;
   `margin-bottom` = `--spacing-tight-block` (48/64 px). *No es un h1 display grande.*
7. **Isla flotante** (`island island--plp`): `fixed` abajo, centrada, dos botones frost — selector de
   categoría con chevron (abre `#modal-lines`) y «Filtrar» con icono (abre `#modal-filter`). Se oculta al
   bajar el scroll y reaparece al subir (`transform .15s`). En móvil el segundo botón es solo icono.
8. **Rejilla de productos**: **a sangre** (sin gutter), `repeat(4, minmax(0,1fr))`; ítem `span 2` en
   móvil (**2 columnas visibles**) y `span 1` ≥768 px (**4 columnas**). Imagen 3/4 `bg #f8f7f5`; hover =
   **cross-fade** a la segunda imagen (sin zoom). Info debajo siempre visible: nombre → precio →
   «Añadir a la bolsa» (o `Agotado` disabled).
9. **Contador**: centrado, `padding-top 20px`, 13 px secundario: **`Has visto {visibles} productos de {total}`**.
10. **Modal de filtros y orden** (`#modal-filter`, `role="dialog" aria-modal="true"`):
    - Header: `Filtros y orden` (`t-body-strong`) + cierre.
    - Orden en radios: `Recomendado` (por defecto), `Precio de mayor a menor`, `Precio de menor a mayor`,
      `Los más vendidos`.
    - Facetas en acordeones `--subtle`; **primera abierta por defecto**; etiquetas en minúsculas en DOM
      con `text-transform: capitalize`; trigger abierto → peso 500.
    - Facetas: `tipo de producto` (no existe → omitir), `color`, `material`, `etiqueta distintiva`
      (no existe → omitir o mapear a flags existentes).
    - Footer: `Borrar todo` (secondary, disabled si no hay filtros) y `Mostrar {N} resultados` (primary).
11. **Modal de subcategorías** (solo móvil): rejilla 2 columnas; enlace 13 px, `padding 12px 20px`,
    `min-height 48px`, `bg #f8f7f5`, hover `#ede9e3`.
12. **Vista rápida** (`#modal-product-ajax`): `Detalles del producto`; carrusel con dots (barra 1 px,
    25 % ancho) y flechas al 16.67 % de cada lado; info centrada `gap 12px`; acciones con wishlist + añadir.
13. **«Visto recientemente»**: carrusel 6/3/3 (desktop/tablet/móvil), sin badges ni vista rápida, dots
    como barra de 1 px, flechas solo en hover con puntero fino. Oculto si está vacío.
14. **Toaster de wishlist**: `role="status"`, 2500 ms, entra desde arriba; mensaje + enlace
    «Ver tu lista de favoritos».
15. **Migas de pan al FINAL de la página** (después de «Visto recientemente», antes del pie): `gap 4px`,
    13 px, sin bordes: `Inicio / Gafas / Gafas de sol`.
16. **Pie**: logo (padding 20/96) → `.footer__cols` (newsletter 8/24 con `NEWSLETTER` + formulario
    `Correo electrónico` / `Sr.-Sra.` / `Nombre` / `Apellidos` / consentimiento / `Suscribirse`; socials
    `flex gap 20px`) → 4 grupos de enlaces (`Relaciones con los clientes`, `Boutiques`, `Empresa`,
    `Legal`) → copyright (`margin-top 96px`) con `Copyright © 2026 Maison Lumière…`, `Cambiar ubicación:
    España (español)` y `€` chip.
