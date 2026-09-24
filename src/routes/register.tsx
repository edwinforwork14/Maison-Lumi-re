import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useStore } from '@/lib/store'
import { registerFn } from '@/features/commerce.api'

export const Route = createFileRoute('/register')({
  head: () => ({ meta: [{ title: 'Crear cuenta — Maison Lumière' }] }),
  component: RegisterPage,
})

function RegisterPage() {
  const { login } = useStore()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
  })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const set = (key: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError('Indique su nombre y apellidos.')
      return
    }
    if (!/^\S+@\S+\.\S+$/.test(form.email)) {
      setError('Introduzca un email válido.')
      return
    }
    if (form.password.length < 4) {
      setError('La contraseña debe tener al menos 4 caracteres.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const user = await registerFn({ data: form })
      login(user)
      navigate({ to: '/account' })
    } catch (err) {
      setError(
        err instanceof Error && err.message.includes('existe')
          ? 'Ya existe una cuenta con este email.'
          : 'No se pudo crear la cuenta. Inténtelo de nuevo.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto grid min-h-[70vh] max-w-md animate-fade-in flex-col justify-center px-4 py-20">
      <div className="text-center">
        <p className="mb-2 text-[11px] uppercase tracking-[0.3em] text-taupe">
          Nueva clienta · Nuevo cliente
        </p>
        <h1 className="mb-10 font-serif text-3xl font-light">Crear cuenta</h1>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <input
          placeholder="Nombre"
          value={form.firstName}
          onChange={set('firstName')}
          className="w-full border border-linen bg-transparent px-4 py-3 text-sm outline-none placeholder:text-clay focus:border-ink"
        />
        <input
          placeholder="Apellidos"
          value={form.lastName}
          onChange={set('lastName')}
          className="w-full border border-linen bg-transparent px-4 py-3 text-sm outline-none placeholder:text-clay focus:border-ink"
        />
        <input
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={set('email')}
          className="w-full border border-linen bg-transparent px-4 py-3 text-sm outline-none placeholder:text-clay focus:border-ink"
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={form.password}
          onChange={set('password')}
          className="w-full border border-linen bg-transparent px-4 py-3 text-sm outline-none placeholder:text-clay focus:border-ink"
        />
        {error && <p className="text-xs text-gold">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-ink py-4 text-[11px] uppercase tracking-[0.25em] text-ivory transition-colors hover:bg-charcoal disabled:cursor-not-allowed disabled:bg-clay"
        >
          {submitting ? 'Creando…' : 'Crear cuenta'}
        </button>
      </form>

      <p className="mt-8 text-center text-sm text-taupe">
        ¿Ya tiene cuenta?{' '}
        <Link to="/login" className="text-ink underline underline-offset-4">
          Iniciar sesión
        </Link>
      </p>
    </div>
  )
}
