import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { loginFn } from '@/features/commerce.api'

export const Route = createFileRoute('/_storefront/login')({
  head: () => ({ meta: [{ title: 'Iniciar sesión — Maison Lumière' }] }),
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('Introduzca un email válido.')
      return
    }
    if (password.length < 4) {
      setError('La contraseña debe tener al menos 4 caracteres.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      // La identidad la fija el servidor (cookie httpOnly): el cliente no
      // guarda ningún dato personal (defecto D6).
      await loginFn({ data: { email, password } })
      navigate({ to: '/account' })
    } catch (err) {
      setError(
        err instanceof Error && err.message.includes('Credenciales')
          ? 'Credenciales incorrectas.'
          : 'No se pudo iniciar sesión. Inténtelo de nuevo.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto grid min-h-[70vh] max-w-md animate-fade-in flex-col justify-center px-4 py-20">
      <div className="text-center">
        <p className="mb-2 label-wide tracking-[0.3em] text-text-secondary">
          Cliente registrado
        </p>
        <h1 className="mb-10 editorial-title">Iniciar sesión</h1>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-line bg-transparent px-4 py-3 text-sm outline-none placeholder:text-text-secondary focus:border-strong"
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-line bg-transparent px-4 py-3 text-sm outline-none placeholder:text-text-secondary focus:border-strong"
        />
        {error && <p className="text-xs text-gold">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="btn btn-solid btn-block label-wide disabled:cursor-not-allowed disabled:bg-line-light"
        >
          {submitting ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <p className="mt-8 text-center text-sm text-text-secondary">
        ¿Aún no tiene cuenta?{' '}
        <Link to="/register" className="text-strong underline underline-offset-4">
          Crear cuenta
        </Link>
      </p>
    </div>
  )
}
