import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useStore } from '@/lib/store'

export const Route = createFileRoute('/login')({
  head: () => ({ meta: [{ title: 'Iniciar sesión — Maison Lumière' }] }),
  component: LoginPage,
})

function LoginPage() {
  const { login } = useStore()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('Introduzca un email válido.')
      return
    }
    if (password.length < 4) {
      setError('La contraseña debe tener al menos 4 caracteres.')
      return
    }
    login({
      firstName: email.split('@')[0],
      lastName: '',
      email,
    })
    navigate({ to: '/account' })
  }

  return (
    <div className="mx-auto grid min-h-[70vh] max-w-md animate-fade-in flex-col justify-center px-4 py-20">
      <div className="text-center">
        <p className="mb-2 text-[11px] uppercase tracking-[0.3em] text-taupe">
          Cliente registrado
        </p>
        <h1 className="mb-10 font-serif text-3xl font-light">Iniciar sesión</h1>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-linen bg-transparent px-4 py-3 text-sm outline-none placeholder:text-clay focus:border-ink"
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-linen bg-transparent px-4 py-3 text-sm outline-none placeholder:text-clay focus:border-ink"
        />
        {error && <p className="text-xs text-gold">{error}</p>}
        <button
          type="submit"
          className="w-full bg-ink py-4 text-[11px] uppercase tracking-[0.25em] text-ivory transition-colors hover:bg-charcoal"
        >
          Entrar
        </button>
      </form>

      <p className="mt-8 text-center text-sm text-taupe">
        ¿Aún no tiene cuenta?{' '}
        <Link to="/register" className="text-ink underline underline-offset-4">
          Crear cuenta
        </Link>
      </p>
    </div>
  )
}
