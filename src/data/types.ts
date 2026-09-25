// Compatibilidad legacy (migración strangler Plan 03 §5).
// El destino de estos tipos es `src/domain/catalog/types.ts`; las rutas y
// componentes deben importar desde allí. Este archivo sólo queda para los
// adaptadores y semillas que aún consumen `@/data`.
export * from '../domain/catalog/types.ts'
