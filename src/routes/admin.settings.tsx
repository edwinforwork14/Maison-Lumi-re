import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { adminListSettings, adminUpdateSetting } from '@/features/admin/admin.api'

/**
 * Ajustes del sitio. El valor se valida por su tipo en el servidor: un ajuste
 * `number` no admite texto, porque el storefront lo consumirá confiando en su
 * forma. Guardar invalida la clave de caché `settings` que usa la tienda.
 */
export const Route = createFileRoute('/admin/settings')({
  component: AdminSettingsPage,
})

function AdminSettingsPage() {
  const queryClient = useQueryClient()
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<string | null>(null)

  const settings = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => adminListSettings(),
  })

  const save = useMutation({
    mutationFn: (input: {
      key: string
      value: string | number | boolean | Record<string, string | number | boolean>
      type: 'string' | 'number' | 'boolean' | 'json'
    }) =>
      adminUpdateSetting({ data: input }),
    onSuccess: (row) => {
      setNotice(`Ajuste ${row.key} guardado.`)
      setEditing(null)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] })
      // La tienda lee estos valores: su caché debe considerarse obsoleta.
      void queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (error: Error) => setNotice(error.message),
  })

  return (
    <div className="space-y-6">
      <h2 className="eyebrow">Ajustes</h2>

      {notice && (
        <p role="status" className="border border-linen bg-sand px-4 py-2 text-xs">
          {notice}
        </p>
      )}

      {settings.isPending ? (
        <div aria-busy="true" className="space-y-3">
          <p className="text-sm text-taupe">Cargando ajustes…</p>
          <div className="skeleton h-16 w-full" />
        </div>
      ) : settings.isError ? (
        <div role="alert" className="border border-linen p-6 text-sm text-taupe">
          No se pudieron cargar los ajustes. Puede que su rol no tenga{' '}
          <code>settings:read</code>.
          <button
            type="button"
            onClick={() => settings.refetch()}
            className="btn btn-outline ml-4 px-4 py-1 label"
          >
            Reintentar
          </button>
        </div>
      ) : settings.data.length === 0 ? (
        <p className="border border-linen p-6 text-sm text-taupe">
          No hay ajustes definidos. Ejecute las semillas (`npm run db:seed`).
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Ajustes del sitio</caption>
          <thead>
            <tr className="border-b border-linen text-left">
              <th scope="col" className="py-2 pr-4 label text-taupe">Clave</th>
              <th scope="col" className="py-2 pr-4 label text-taupe">Valor</th>
              <th scope="col" className="py-2 pr-4 label text-taupe">Tipo</th>
              <th scope="col" className="py-2 label text-taupe">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {settings.data.map((setting) => (
              <tr key={setting.key} className="border-b border-linen align-top">
                <td className="py-3 pr-4 font-mono text-xs">{setting.key}</td>
                <td className="py-3 pr-4">{JSON.stringify(setting.value)}</td>
                <td className="py-3 pr-4 text-xs text-taupe">{setting.type}</td>
                <td className="py-3">
                  <button
                    type="button"
                    onClick={() => setEditing(editing === setting.key ? null : setting.key)}
                    aria-expanded={editing === setting.key}
                    className="btn btn-outline px-3 py-1 label"
                  >
                    {editing === setting.key ? 'Cerrar' : 'Editar'}
                  </button>

                  {editing === setting.key && (
                    <form
                      className="mt-3 grid gap-2 border border-linen p-3 sm:grid-cols-3"
                      onSubmit={(event) => {
                        event.preventDefault()
                        const form = new FormData(event.currentTarget)
                        const type = String(form.get('type')) as 'string' | 'number' | 'boolean' | 'json'
                        const raw = String(form.get('value') ?? '')
                        const value =
                          type === 'number'
                            ? Number(raw)
                            : type === 'boolean'
                              ? raw === 'true'
                              : raw
                        save.mutate({ key: setting.key, value, type })
                      }}
                    >
                      <label className="sm:col-span-2">
                        <span className="mb-1 block label text-taupe">Valor</span>
                        <input
                          name="value"
                          defaultValue={
                            typeof setting.value === 'object'
                              ? JSON.stringify(setting.value)
                              : String(setting.value)
                          }
                          className="field"
                        />
                      </label>
                      <label>
                        <span className="mb-1 block label text-taupe">Tipo</span>
                        <select name="type" defaultValue={setting.type} className="field">
                          <option value="string">Texto</option>
                          <option value="number">Número</option>
                          <option value="boolean">Booleano</option>
                          <option value="json">JSON</option>
                        </select>
                      </label>
                      <div className="sm:col-span-3">
                        <button
                          type="submit"
                          disabled={save.isPending}
                          className="btn btn-solid px-4 py-2 label disabled:bg-clay"
                        >
                          {save.isPending ? 'Guardando…' : 'Guardar ajuste'}
                        </button>
                      </div>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
