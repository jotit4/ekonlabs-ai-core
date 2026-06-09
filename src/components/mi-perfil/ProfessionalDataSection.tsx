'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import {
  UpdateMyProfessionalSchema,
  type UpdateMyProfessionalValues,
} from '@/lib/schemas/mi-perfil.schema'

type ServiceItem = { service_id: string; name: string }

type ProfessionalData = {
  professional_id: string
  professional_name: string
  professional_email: string
  services: ServiceItem[]
}

type State =
  | { status: 'loading' }
  | { status: 'not-assigned' }
  | { status: 'error' }
  | { status: 'ready'; data: ProfessionalData }

const inputClass =
  'w-full px-3 py-2 rounded-[8px] border border-[var(--color-border)] text-sm bg-[var(--color-bg)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]'
const labelClass = 'block text-sm font-medium text-[var(--color-text-primary)] mb-1'
const sectionCard =
  'rounded-[12px] border border-[var(--color-border)] bg-[var(--color-bg)] p-6'
const primaryBtn =
  'inline-flex items-center justify-center rounded-[8px] bg-[var(--color-interactive)] px-4 py-2 text-sm font-medium text-white transition-colors duration-120 disabled:opacity-50'

export function ProfessionalDataSection() {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpdateMyProfessionalValues>({
    resolver: standardSchemaResolver(UpdateMyProfessionalSchema),
    defaultValues: { name: '', email: '' },
  })

  useEffect(() => {
    fetch('/api/me/professional')
      .then(async (res) => {
        if (res.status === 404) {
          setState({ status: 'not-assigned' })
          return
        }
        if (!res.ok) {
          setState({ status: 'error' })
          return
        }
        const json = await res.json()
        const data = json.data as ProfessionalData
        setState({ status: 'ready', data })
        reset({ name: data.professional_name, email: data.professional_email })
      })
      .catch(() => setState({ status: 'error' }))
  }, [reset])

  async function onSubmit(values: UpdateMyProfessionalValues) {
    setSaveMessage(null)
    setSaveError(null)
    const res = await fetch('/api/me/professional', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: values.name, email: values.email }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => null)
      setSaveError(json?.error ?? 'No se pudo actualizar el perfil profesional.')
      return
    }
    const json = await res.json()
    setSaveMessage('Datos profesionales actualizados.')
    if (state.status === 'ready') {
      setState({
        status: 'ready',
        data: {
          ...state.data,
          professional_name: json.data.name ?? state.data.professional_name,
          professional_email: json.data.email ?? state.data.professional_email,
        },
      })
    }
  }

  if (state.status === 'loading') {
    return (
      <div
        role="status"
        aria-label="Cargando datos profesionales"
        className="animate-pulse space-y-4"
        data-testid="professional-data-loading"
      >
        <div className="h-48 bg-[var(--color-surface)] rounded-[8px]" />
      </div>
    )
  }

  if (state.status === 'not-assigned') {
    return (
      <section className={sectionCard} data-testid="professional-data-not-assigned">
        <h2 className="text-lg font-semibold mb-4">Datos profesionales</h2>
        <p role="alert" className="text-sm text-[var(--color-text-secondary)]">
          Tu cuenta aún no tiene un profesional asignado. Contactá al administrador.
        </p>
      </section>
    )
  }

  if (state.status === 'error') {
    return (
      <section className={sectionCard} data-testid="professional-data-error">
        <h2 className="text-lg font-semibold mb-4">Datos profesionales</h2>
        <p role="alert" className="text-sm text-[var(--color-text-secondary)]">
          No se pudieron cargar tus datos profesionales. Intentá de nuevo más tarde.
        </p>
      </section>
    )
  }

  const { services } = state.data

  return (
    <section className={sectionCard} data-testid="professional-data-section">
      <h2 className="text-lg font-semibold mb-4">Datos profesionales</h2>

      <form onSubmit={handleSubmit(onSubmit)} className="mb-6 space-y-4">
        <div>
          <label htmlFor="prof_name" className={labelClass}>Nombre profesional</label>
          <input id="prof_name" type="text" className={inputClass} {...register('name')} />
          {errors.name && (
            <p role="alert" className="mt-1 text-xs text-red-600">{errors.name.message}</p>
          )}
        </div>
        <div>
          <label htmlFor="prof_email" className={labelClass}>Email de contacto profesional</label>
          <input id="prof_email" type="email" className={inputClass} {...register('email')} />
          {errors.email && (
            <p role="alert" className="mt-1 text-xs text-red-600">{errors.email.message}</p>
          )}
        </div>
        <button type="submit" className={primaryBtn} disabled={isSubmitting}>
          Guardar datos profesionales
        </button>
        {saveError && (
          <p role="alert" className="text-xs text-red-600">{saveError}</p>
        )}
        {saveMessage && (
          <p role="status" className="text-xs text-green-600">{saveMessage}</p>
        )}
      </form>

      {/* Servicios que ofrece — SOLO LECTURA */}
      <div className="mb-6">
        <p className={labelClass}>Servicios que ofrece</p>
        {services.length === 0 ? (
          <p className="text-sm text-[var(--color-text-secondary)]">
            No tenés servicios asignados. La asignación la gestiona el administrador.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2" data-testid="professional-services" role="list">
            {services.map((s) => (
              <li
                key={s.service_id}
                className="inline-flex items-center rounded-full border border-[var(--color-border)]
                  bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-primary)]"
              >
                {s.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Link a mi disponibilidad */}
      <Link
        href="/mi-disponibilidad"
        className="text-sm font-medium text-[var(--color-interactive)] hover:underline"
      >
        Gestionar mis horarios
      </Link>
    </section>
  )
}
