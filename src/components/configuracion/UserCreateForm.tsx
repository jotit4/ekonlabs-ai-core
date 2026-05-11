'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { createUserSchema, type CreateUserFormValues } from '@/lib/schemas/users'

interface UserCreateFormProps {
  onSuccess?: () => void
}

export function UserCreateForm({ onSuccess }: UserCreateFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserFormValues>({
    resolver: standardSchemaResolver(createUserSchema),
    defaultValues: {
      email: '',
      full_name: '',
      role: 'receptionist',
    },
  })

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
