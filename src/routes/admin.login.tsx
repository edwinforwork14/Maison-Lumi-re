import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { adminLogin } from '@/features/admin/admin.api'

/** Acceso al panel: sesión `admin` propia, separada de la de la tienda. */
export const Route = createFileRoute('/admin/login')({
  head: () => ({ meta: [{ title: 'Acceso al panel — Maison Lumière' }] }),
  component: AdminLoginPage,
})

function AdminLoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await adminLogin({ data: { email, password } })
      await navigate({ to: '/admin' })
    } catch (err) {
      setError(
        err instanceof Error && /credenciales/i.test(err.message)
          ? 'Credenciales incorrectas.'
          : 'No se pudo iniciar sesión en el panel.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-20">
      <div className="mb-10 text-center">
        <p className="eyebrow mb-2">Administración</p>
        <h1 className="font-serif text-3xl font-light">Acceso al panel</h1>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor="admin-email" className="mb-1 block label text-taupe">
            Email
          </label>
          <input
            id="admin-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="field"
            required
          />
        </div>
        <div>
          <label htmlFor="admin-password" className="mb-1 block label text-taupe">
            Contraseña
          </label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="field"
            required
          />
        </div>

        {error && (
          <p role="alert" className="text-xs text-gold">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="btn btn-solid btn-block label-wide disabled:cursor-not-allowed disabled:bg-clay"
        >
          {submitting ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <p className="mt-8 text-center text-xs text-taupe">
        La sesión del panel dura 8 horas y es independiente de su cuenta de cliente.
      </p>
    </div>
  )
}
