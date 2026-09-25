import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { registerFn } from '@/features/commerce.api'

export const Route = createFileRoute('/_storefront/register')({
  head: () => ({ meta: [{ title: 'Crear cuenta — Maison Lumière' }] }),
  component: RegisterPage,
})

function RegisterPage() {
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
      // La identidad la fija el servidor (cookie httpOnly): el cliente no
      // guarda ningún dato personal (defecto D6).
      await registerFn({ data: form })
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
        <p className="mb-2 label-wide tracking-[0.3em] text-text-secondary">
          Nueva clienta · Nuevo cliente
        </p>
        <h1 className="mb-10 editorial-title">Crear cuenta</h1>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <input
          placeholder="Nombre"
          value={form.firstName}
          onChange={set('firstName')}
          className="w-full border border-line bg-transparent px-4 py-3 text-sm outline-none placeholder:text-text-secondary focus:border-strong"
        />
        <input
          placeholder="Apellidos"
          value={form.lastName}
          onChange={set('lastName')}
          className="w-full border border-line bg-transparent px-4 py-3 text-sm outline-none placeholder:text-text-secondary focus:border-strong"
        />
        <input
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={set('email')}
          className="w-full border border-line bg-transparent px-4 py-3 text-sm outline-none placeholder:text-text-secondary focus:border-strong"
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={form.password}
          onChange={set('password')}
          className="w-full border border-line bg-transparent px-4 py-3 text-sm outline-none placeholder:text-text-secondary focus:border-strong"
        />
        {error && <p className="text-xs text-gold">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="btn btn-solid btn-block label-wide disabled:cursor-not-allowed disabled:bg-line-light"
        >
          {submitting ? 'Creando…' : 'Crear cuenta'}
        </button>
      </form>

      <p className="mt-8 text-center text-sm text-text-secondary">
        ¿Ya tiene cuenta?{' '}
        <Link to="/login" className="text-strong underline underline-offset-4">
          Iniciar sesión
        </Link>
      </p>
    </div>
  )
}
