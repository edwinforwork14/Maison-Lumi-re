/**
 * Contador de resultados (Plan 04 §2.8): centrado, 13 px, color secundario,
 * literal de la referencia — «Has visto N productos de N».
 */
export function ResultsCount({
  visible,
  total,
}: {
  readonly visible: number
  readonly total: number
}) {
  return (
    <div className="px-5 pt-5 text-center md:px-10">
      <p className="body-text text-text-secondary">
        Has visto {visible} {visible === 1 ? 'producto' : 'productos'} de {total}
      </p>
    </div>
  )
}
