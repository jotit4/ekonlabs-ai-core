'use client'

import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import {
  createUserSchema,
  ATTENTION_MODE_LABELS,
  type CreateUserFormValues,
} from '@/lib/schemas/users'

interface UserCreateFormProps {
  onSuccess?: () => void
}

/** Profesional disponible para vincular (subset de GET /api/profesionales). */
interface ProfessionalOption {
  professional_id: string
  name: string
  active: boolean
  linked_user_email: string | null
}

export function UserCreateForm({ onSuccess }: UserCreateFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserFormValues>({
    resolver: standardSchemaResolver(createUserSchema),
    defaultValues: {
      email: '',
      full_name: '',
      role: 'receptionist',
    },
  })

  // El vínculo con un profesional y el tipo de atención solo aplican a médicos:
  // recepción no atiende pacientes.
  const selectedRole = useWatch({ control, name: 'role' })
  const isDoctor = selectedRole === 'doctor'

  // Solo se piden los profesionales cuando hacen falta (rol médico).
  const { data: professionals = [], isPending: isLoadingProfessionals } = useQuery<
    ProfessionalOption[]
  >({
    queryKey: ['profesionales', 'para-vincular'],
    queryFn: async () => {
      const res = await fetch('/api/profesionales')
      if (!res.ok) throw new Error('Error al cargar profesionales')
      const body = (await res.json()) as { professionals?: ProfessionalOption[] }
      return body.professionals ?? []
    },
    enabled: isDoctor,
    staleTime: 5 * 60 * 1000,
  })

  // Un profesional ya vinculado a otra cuenta no se ofrece: el vínculo es 1:1
  // (la agenda propia se resuelve por professional_id) y el server lo rechaza.
  const selectableProfessionals = professionals.filter((p) => p.active && !p.linked_user_email)

  const onSubmit = async (data: CreateUserFormValues) => {
    setServerError(null)
    setSuccessMessage(null)

    try {
      const response = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (response.status === 409) {
        const body = await response.json()
        setServerError(body.error ?? 'Ya existe un usuario con ese email')
        return
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        setServerError(body.error ?? 'Error al crear el usuario')
        return
      }

      // Éxito
      reset()
      setSuccessMessage('Usuario invitado — recibirá un email para establecer su contraseña')
      onSuccess?.()
    } catch {
      setServerError('Error de red. Verificá tu conexión e intentá de nuevo.')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 max-w-md">
      {/* Campo email */}
      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-[var(--color-text-primary)] mb-1"
        >
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          {...register('email')}
          className={[
            'w-full px-3 py-2 rounded-[8px] border text-sm',
            'bg-[var(--color-bg)] text-[var(--color-text-primary)]',
            'focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]',
            errors.email || serverError
              ? 'border-red-400'
              : 'border-[var(--color-border)]',
          ].join(' ')}
          aria-invalid={!!(errors.email || serverError)}
          aria-describedby={errors.email ? 'email-error' : serverError ? 'server-error' : undefined}
        />
        {errors.email && (
          <p id="email-error" role="alert" className="mt-1 text-xs text-red-600">
            {errors.email.message}
          </p>
        )}
        {serverError && !errors.email && (
          <p id="server-error" role="alert" className="mt-1 text-xs text-red-600">
            {serverError}
          </p>
        )}
      </div>

      {/* Campo full_name */}
      <div>
        <label
          htmlFor="full_name"
          className="block text-sm font-medium text-[var(--color-text-primary)] mb-1"
        >
          Nombre completo
        </label>
        <input
          id="full_name"
          type="text"
          autoComplete="name"
          {...register('full_name')}
          className={[
            'w-full px-3 py-2 rounded-[8px] border text-sm',
            'bg-[var(--color-bg)] text-[var(--color-text-primary)]',
            'focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]',
            errors.full_name ? 'border-red-400' : 'border-[var(--color-border)]',
          ].join(' ')}
          aria-invalid={!!errors.full_name}
          aria-describedby={errors.full_name ? 'full-name-error' : undefined}
        />
        {errors.full_name && (
          <p id="full-name-error" role="alert" className="mt-1 text-xs text-red-600">
            {errors.full_name.message}
          </p>
        )}
      </div>

      {/* Campo role */}
      <div>
        <label
          htmlFor="role"
          className="block text-sm font-medium text-[var(--color-text-primary)] mb-1"
        >
          Rol
        </label>
        <select
          id="role"
          {...register('role')}
          className={[
            'w-full px-3 py-2 rounded-[8px] border text-sm',
            'bg-[var(--color-bg)] text-[var(--color-text-primary)]',
            'focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]',
            errors.role ? 'border-red-400' : 'border-[var(--color-border)]',
          ].join(' ')}
          aria-invalid={!!errors.role}
        >
          <option value="receptionist">Recepcionista</option>
          <option value="doctor">Médico</option>
        </select>
        {errors.role && (
          <p role="alert" className="mt-1 text-xs text-red-600">
            {errors.role.message}
          </p>
        )}
      </div>

      {/* Vínculo con el profesional + tipo de atención — solo para médicos.
          Juntos definen la navegación por defecto del usuario (migración 056). */}
      {isDoctor && (
        <>
          <div>
            <label
              htmlFor="professional_id"
              className="block text-sm font-medium text-[var(--color-text-primary)] mb-1"
            >
              Profesional vinculado
            </label>
            <select
              id="professional_id"
              {...register('professional_id')}
              disabled={isLoadingProfessionals}
              className={[
                'w-full px-3 py-2 rounded-[8px] border text-sm',
                'bg-[var(--color-bg)] text-[var(--color-text-primary)]',
                'focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]',
                errors.professional_id ? 'border-red-400' : 'border-[var(--color-border)]',
              ].join(' ')}
              aria-invalid={!!errors.professional_id}
              aria-describedby={errors.professional_id ? 'professional-error' : undefined}
            >
              <option value="">
                {isLoadingProfessionals
                  ? 'Cargando profesionales...'
                  : selectableProfessionals.length === 0
                    ? 'No hay profesionales libres para vincular'
                    : 'Seleccioná un profesional'}
              </option>
              {selectableProfessionals.map((p) => (
                <option key={p.professional_id} value={p.professional_id}>
                  {p.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              Es la ficha de agenda del médico. Sin vínculo no puede ver su agenda propia.
            </p>
            {errors.professional_id && (
              <p id="professional-error" role="alert" className="mt-1 text-xs text-red-600">
                {errors.professional_id.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="attention_mode"
              className="block text-sm font-medium text-[var(--color-text-primary)] mb-1"
            >
              Tipo de atención
            </label>
            <select
              id="attention_mode"
              {...register('attention_mode')}
              className={[
                'w-full px-3 py-2 rounded-[8px] border text-sm',
                'bg-[var(--color-bg)] text-[var(--color-text-primary)]',
                'focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]',
                errors.attention_mode ? 'border-red-400' : 'border-[var(--color-border)]',
              ].join(' ')}
              aria-invalid={!!errors.attention_mode}
              aria-describedby="attention-mode-help"
            >
              <option value="">Seleccioná cómo atiende</option>
              <option value="appointment">{ATTENTION_MODE_LABELS.appointment}</option>
              <option value="walk_in">{ATTENTION_MODE_LABELS.walk_in}</option>
            </select>
            <p id="attention-mode-help" className="mt-1 text-xs text-[var(--color-text-secondary)]">
              Define a dónde entra al iniciar sesión: por orden de llegada abre su día en
              el Calendario; por turnos abre Mi jornada.
            </p>
            {errors.attention_mode && (
              <p role="alert" className="mt-1 text-xs text-red-600">
                {errors.attention_mode.message}
              </p>
            )}
          </div>
        </>
      )}

      {/* Mensaje de éxito */}
      {successMessage && (
        <p role="status" className="text-sm text-green-700 bg-green-50 rounded-[8px] px-3 py-2">
          {successMessage}
        </p>
      )}

      {/* Botón de submit */}
      <button
        type="submit"
        disabled={isSubmitting}
        className={[
          'w-full px-4 py-2 rounded-[8px] text-sm font-medium',
          'bg-[var(--color-interactive)] text-white',
          'hover:opacity-90 transition-opacity min-h-[44px]',
          isSubmitting ? 'opacity-50 cursor-not-allowed' : '',
        ].join(' ')}
      >
        {isSubmitting ? 'Enviando invitación...' : 'Invitar usuario'}
      </button>
    </form>
  )
}
