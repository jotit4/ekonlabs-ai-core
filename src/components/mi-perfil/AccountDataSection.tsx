'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  UpdateProfileSchema,
  type UpdateProfileValues,
} from '@/lib/schemas/mi-perfil.schema'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  doctor: 'Médico',
  receptionist: 'Recepcionista',
}

type ProfileData = {
  full_name: string
  login_email: string
  role: string
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: ProfileData }

const inputClass =
  'w-full px-3 py-2 rounded-[8px] border border-[var(--color-border)] text-sm bg-[var(--color-bg)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]'
const labelClass = 'block text-sm font-medium text-[var(--color-text-primary)] mb-1'
const sectionCard =
  'rounded-[12px] border border-[var(--color-border)] bg-[var(--color-bg)] p-6'
const primaryBtn =
  'inline-flex items-center justify-center rounded-[8px] bg-[var(--color-interactive)] px-4 py-2 text-sm font-medium text-white transition-colors duration-120 disabled:opacity-50'

export function AccountDataSection({ role }: { role: string }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  // ── Nombre completo ──────────────────────────────────────────────────────
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpdateProfileValues>({
    resolver: standardSchemaResolver(UpdateProfileSchema),
    defaultValues: { full_name: '' },
  })
  const [nameMessage, setNameMessage] = useState<string | null>(null)

  // ── Email de login ───────────────────────────────────────────────────────
  const [emailInput, setEmailInput] = useState('')
  const [emailPending, setEmailPending] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailBusy, setEmailBusy] = useState(false)

  // ── Contraseña ───────────────────────────────────────────────────────────
  const [pwd, setPwd] = useState('')
  const [pwd2, setPwd2] = useState('')
  const [pwdError, setPwdError] = useState<string | null>(null)
  const [pwdSuccess, setPwdSuccess] = useState(false)
  const [pwdBusy, setPwdBusy] = useState(false)

  useEffect(() => {
    fetch('/api/me/profile')
      .then(async (res) => {
        if (!res.ok) {
          setState({ status: 'error' })
          return
        }
        const json = await res.json()
        const data = json.data as ProfileData
        setState({ status: 'ready', data })
        reset({ full_name: data.full_name })
        setEmailInput(data.login_email)
      })
      .catch(() => setState({ status: 'error' }))
  }, [reset])

  async function onSubmitName(values: UpdateProfileValues) {
    setNameMessage(null)
    const res = await fetch('/api/me/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: values.full_name }),
    })
    if (!res.ok) {
      setNameMessage('No se pudo actualizar el nombre.')
      return
    }
    const json = await res.json()
    setNameMessage('Nombre actualizado.')
    if (state.status === 'ready') {
      setState({ status: 'ready', data: { ...state.data, full_name: json.data.full_name } })
    }
  }

  async function handleEmailUpdate() {
    setEmailError(null)
    setEmailPending(null)
    const next = emailInput.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
      setEmailError('Ingresá un email válido')
      return
    }
    setEmailBusy(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const { error } = await supabase.auth.updateUser({ email: next })
      if (error) {
        const msg = (error.message ?? '').toLowerCase()
        if (msg.includes('already') || msg.includes('exists') || msg.includes('registered')) {
          setEmailError('Ese email ya está en uso')
        } else {
          setEmailError('No se pudo actualizar el email')
        }
        return
      }
      setEmailPending(next)
    } catch {
      setEmailError('No se pudo actualizar el email')
    } finally {
      setEmailBusy(false)
    }
  }

  async function handlePasswordUpdate() {
    setPwdError(null)
    setPwdSuccess(false)
    if (pwd.length < 8) {
      setPwdError('La contraseña debe tener al menos 8 caracteres')
      return
    }
    if (pwd !== pwd2) {
      setPwdError('Las contraseñas no coinciden')
      return
    }
    setPwdBusy(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const { error } = await supabase.auth.updateUser({ password: pwd })
      if (error) {
        const msg = (error.message ?? '').toLowerCase()
        if (msg.includes('reauth') || msg.includes('recent') || msg.includes('session')) {
          setPwdError('Por seguridad, volvé a iniciar sesión e intentá de nuevo.')
        } else {
          setPwdError('No se pudo actualizar la contraseña')
        }
        return
      }
      setPwdSuccess(true)
      setPwd('')
      setPwd2('')
    } catch {
      setPwdError('No se pudo actualizar la contraseña')
    } finally {
      setPwdBusy(false)
    }
  }

  if (state.status === 'loading') {
    return (
      <div
        role="status"
        aria-label="Cargando datos de cuenta"
        className="animate-pulse space-y-4"
        data-testid="account-data-loading"
      >
        <div className="h-48 bg-[var(--color-surface)] rounded-[8px]" />
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 py-12 text-[var(--color-text-secondary)]"
        data-testid="account-data-error"
      >
        <p className="text-sm text-center">
          No se pudieron cargar tus datos de cuenta. Intentá de nuevo más tarde.
        </p>
      </div>
    )
  }

  const roleLabel = ROLE_LABELS[role] ?? role

  return (
    <section className={sectionCard} data-testid="account-data-section">
      <h2 className="text-lg font-semibold mb-4">Datos de cuenta</h2>

      {/* Nombre completo */}
      <form onSubmit={handleSubmit(onSubmitName)} className="mb-6">
        <label htmlFor="full_name" className={labelClass}>Nombre completo</label>
        <div className="flex gap-2">
          <input id="full_name" type="text" className={inputClass} {...register('full_name')} />
          <button type="submit" className={primaryBtn} disabled={isSubmitting}>
            Guardar
          </button>
        </div>
        {errors.full_name && (
          <p role="alert" className="mt-1 text-xs text-red-600">{errors.full_name.message}</p>
        )}
        {nameMessage && (
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{nameMessage}</p>
        )}
      </form>

      {/* Email de login */}
      <div className="mb-6">
        <label htmlFor="login_email" className={labelClass}>Email de inicio de sesión</label>
        <div className="flex gap-2">
          <input
            id="login_email"
            type="email"
            className={inputClass}
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
          />
          <button
            type="button"
            className={primaryBtn}
            onClick={handleEmailUpdate}
            disabled={emailBusy}
          >
            Actualizar email
          </button>
        </div>
        {emailError && (
          <p role="alert" className="mt-1 text-xs text-red-600">{emailError}</p>
        )}
        {emailPending && (
          <p role="status" className="mt-1 text-xs text-[var(--color-text-secondary)]">
            Pendiente de confirmación: revisá {emailPending} para confirmar el cambio. Tu email de
            inicio de sesión actual sigue vigente hasta entonces.
          </p>
        )}
      </div>

      {/* Cambiar contraseña */}
      <div className="mb-6">
        <p className={labelClass}>Cambiar contraseña</p>
        <div className="space-y-2">
          <input
            type="password"
            aria-label="Nueva contraseña"
            placeholder="Nueva contraseña"
            className={inputClass}
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
          />
          <input
            type="password"
            aria-label="Confirmar nueva contraseña"
            placeholder="Confirmar nueva contraseña"
            className={inputClass}
            value={pwd2}
            onChange={(e) => setPwd2(e.target.value)}
          />
          <button
            type="button"
            className={primaryBtn}
            onClick={handlePasswordUpdate}
            disabled={pwdBusy}
          >
            Cambiar contraseña
          </button>
        </div>
        {pwdError && (
          <p role="alert" className="mt-1 text-xs text-red-600">{pwdError}</p>
        )}
        {pwdSuccess && (
          <p role="status" className="mt-1 text-xs text-green-600">Contraseña actualizada.</p>
        )}
      </div>

      {/* Rol — solo lectura */}
      <div>
        <p className={labelClass}>Rol</p>
        <p className="text-sm text-[var(--color-text-secondary)]" data-testid="account-role">
          {roleLabel}
        </p>
      </div>
    </section>
  )
}
