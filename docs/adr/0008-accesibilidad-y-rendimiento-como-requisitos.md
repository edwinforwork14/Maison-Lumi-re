# ADR 0008 — Accesibilidad y rendimiento como requisitos de aceptación

- **Estado:** Aceptada (parcial: axe/s presupuestos pendientes de Fase 4)
- **Fecha:** 2026-09-24
- **Contexto:** plan.md §5.6, §7.6, §12.2.10-13

## Contexto y problema

Los diálogos carecían de semántica y foco, el catálogo no tenía estados de
carga, y no había presupuestos de rendimiento medibles.

## Decisión

**Accesibilidad (WCAG AA):**

- Todo diálogo: `role="dialog"` + `aria-modal` + focus trap + Escape +
  restauración de foco + scroll lock (Drawer, MobileMenu, SearchOverlay).
- Skip-link al contenido, foco visible global (`:focus-visible`).
- `prefers-reduced-motion` respetado en todas las animaciones.
- Steppers con límites deshabilitados y `role="status"` para anuncios.

**Rendimiento (presupuestos del plan §7.6):**

- Estados `pendingComponent` (skeletons) en rutas de datos (D19).
- `defaultPreload: 'intent'` en el router; loaders SSR con datos completos.
- Presupuestos a verificar en Fase 4: LCP < 2,5 s, CLS < 0,05, INP < 200 ms,
  JS de catálogo < 180 kB gzip.

## Consecuencias

- ✅ Navegación por teclado completa en drawers, mega menú y búsqueda.
- ✅ Cero CLS de imágenes si se adopta `AspectImage` (Fase 4).
- ⚠️ Auditoría axe y matriz de viewports 1440/1280/1024/768/390: pendiente
  de la Fase 4 (e2e con la skill webapp-testing).
