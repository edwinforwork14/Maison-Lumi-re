import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  adminAssignRole,
  adminListRoles,
  adminListUsers,
  adminRevokeRole,
} from '@/features/admin/admin.api'

/**
 * Usuarios y roles. Solo `super_admin` entra aquí (`users:manage`).
 *
 * La regla que importa: **no se puede revocar el último super administrador
 * activo**. Si se intenta, el servidor responde CONFLICT y el panel lo explica
 * en lugar de dejar la tienda sin nadie capaz de conceder permisos.
 */
export const Route = createFileRoute('/admin/users')({
  component: AdminUsersPage,
})

function AdminUsersPage() {
  const queryClient = useQueryClient()
  const [q, setQ] = useState('')
  const [notice, setNotice] = useState('')
  const [rowUserId, setRowUserId] = useState<string | null>(null)

  const users = useQuery({
    queryKey: ['admin', 'users', q],
    queryFn: () => adminListUsers({ data: { q: q.trim() || undefined } }),
  })
  const roles = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: () => adminListRoles(),
  })

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })

  const grant = useMutation({
    mutationFn: (input: { userId: string; roleKey: string }) => adminAssignRole({ data: input }),
    onSuccess: () => {
      setNotice('Rol concedido.')
      invalidate()
    },
    onError: (error: Error) => setNotice(error.message),
  })

  const revoke = useMutation({
    mutationFn: (input: { userId: string; roleKey: string }) => adminRevokeRole({ data: input }),
    onSuccess: () => {
      setNotice('Rol revocado.')
      invalidate()
    },
    onError: (error: Error) => setNotice(error.message),
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="eyebrow">Usuarios y roles</h2>
        <label>
          <span className="mb-1 block label text-taupe">Buscar</span>
          <input
            type="search"
            value={q}
            placeholder="Email"
            onChange={(event) => setQ(event.target.value)}
            className="field"
          />
        </label>
      </div>

      {notice && (
        <p role="status" className="border border-linen bg-sand px-4 py-2 text-xs">
          {notice}
        </p>
      )}

      {users.isPending ? (
        <div aria-busy="true" className="space-y-3">
          <p className="text-sm text-taupe">Cargando usuarios…</p>
          <div className="skeleton h-16 w-full" />
        </div>
      ) : users.isError ? (
        <div role="alert" className="border border-linen p-6 text-sm text-taupe">
          No se pudieron cargar los usuarios. Su rol necesita <code>users:manage</code>, que solo
          tiene el super administrador.
          <button
            type="button"
            onClick={() => users.refetch()}
            className="btn btn-outline ml-4 px-4 py-1 label"
          >
            Reintentar
          </button>
        </div>
      ) : users.data.length === 0 ? (
        <p className="border border-linen p-6 text-sm text-taupe">No hay usuarios con este filtro.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Usuarios y sus roles</caption>
          <thead>
            <tr className="border-b border-linen text-left">
              <th scope="col" className="py-2 pr-4 label text-taupe">Usuario</th>
              <th scope="col" className="py-2 pr-4 label text-taupe">Estado</th>
              <th scope="col" className="py-2 pr-4 label text-taupe">Roles</th>
              <th scope="col" className="py-2 label text-taupe">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.data.map((user) => (
              <tr key={user.userId} className="border-b border-linen align-top">
                <td className="py-3 pr-4">
                  {user.email}
                  {user.lastLogin ? (
                    <span className="block text-xs text-taupe">
                      última sesión {new Date(user.lastLogin).toLocaleDateString('es-ES')}
                    </span>
                  ) : null}
                </td>
                <td className="py-3 pr-4">{user.status}</td>
                <td className="py-3 pr-4">
                  <ul className="space-y-1">
                    {user.roleKeys.length === 0 ? (
                      <li className="text-xs text-taupe">Sin roles</li>
                    ) : (
                      user.roleKeys.map((key) => (
                        <li key={key} className="flex items-center gap-2 text-xs">
                          <span>{key}</span>
                          <button
                            type="button"
                            disabled={revoke.isPending}
                            onClick={() => revoke.mutate({ userId: user.userId, roleKey: key })}
                            className="label text-taupe underline-offset-4 hover:text-ink hover:underline"
                          >
                            revocar
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </td>
                <td className="py-3">
                  <button
                    type="button"
                    onClick={() => setRowUserId(rowUserId === user.userId ? null : user.userId)}
                    aria-expanded={rowUserId === user.userId}
                    className="btn btn-outline px-3 py-1 label"
                  >
                    {rowUserId === user.userId ? 'Cerrar' : 'Conceder rol'}
                  </button>

                  {rowUserId === user.userId && (
                    <form
                      className="mt-3 flex flex-wrap items-end gap-2 border border-linen p-3"
                      onSubmit={(event) => {
                        event.preventDefault()
                        const form = new FormData(event.currentTarget)
                        grant.mutate({
                          userId: user.userId,
                          roleKey: String(form.get('roleKey') ?? ''),
                        })
                      }}
                    >
                      <label>
                        <span className="mb-1 block label text-taupe">Rol</span>
                        <select name="roleKey" className="field" required>
                          {(roles.data ?? []).map((role) => (
                            <option key={role.key} value={role.key}>
                              {role.name} ({role.permissionCount} permisos)
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="submit"
                        disabled={grant.isPending}
                        className="btn btn-solid px-4 py-3 label disabled:bg-clay"
                      >
                        Conceder
                      </button>
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
