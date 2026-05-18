'use client'

import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useCreateProfessionalUser } from '@/hooks/use-create-professional-user'
import {
  CreateProfessionalUserSchema,
  type CreateProfessionalUserFormValues,
} from '@/lib/schemas/profesionales.schema'

interface CreateUserModalProps {
  professionalId: string
  professionalName: string
  onClose: () => void
}

export function CreateUserModal({ professionalId, professionalName, onClose }: CreateUserModalProps) {
  const createUser = useCreateProfessionalUser()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<CreateProfessionalUserFormValues>({
    resolver: standardSchemaResolver(CreateProfessionalUserSchema),
    defaultValues: { email: '' },
  })

  const onSubmit = async (data: CreateProfessionalUserFormValues) => {
    createUser.mutate(
      { professionalId, email: data.email },
      {
        onSuccess: () => {
          onClose()
        },
        onError: (err) => {
          setError('email', { message: err.message ?? 'Error al crear la cuenta' })
        },
      }
    )
  }

  const isPending = createUser.isPending || isSubmitting

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-user-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      data-testid="create-user-modal"
    >
      <div className="w-full max-w-md bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[12px] p-6 shadow-xl">
        <h2
          id="create-user-modal-title"
          className="text-base font-semibold text-[var(--color-text-primary)] mb-1"
        >
          Crear cuenta de usuario
        </h2>
        <p className="text-sm text-[var(--color-text-secondary)] mb-4">
          Profesional: <span className="font-medium">{professionalName}</span>
        </p>

        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          aria-label="Formulario de crear cuenta de usuario"
        >
          <div className="mb-4">
            <label
              htmlFor="modal-user-email"
              className="block text-sm font-medium text-[var(--color-text-primary)] mb-1"
            >
              Email <span aria-hidden="true">*</span>
            </label>
            <input
              id="modal-user-email"
              type="email"
              autoComplete="email"
              autoFocus
              {...register('email')}
              className={[
                'w-full rounded-[6px] border px-3 py-2 text-sm bg-[var(--color-bg)]',
                'text-[var(--color-text-primary)] outline-none',
                'focus:ring-2 focus:ring-[var(--color-interactive)] focus:border-transparent',
                errors.email ? 'border-red-400' : 'border-[var(--color-border)]',
              ].join(' ')}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'modal-user-email-error' : undefined}
              disabled={isPending}
            />
            {errors.email && (
              <p id="modal-user-email-error" role="alert" className="mt-1 text-xs text-red-600">
                {errors.email.message}
              </p>
            )}
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
              Rol
            </label>
            <p
              className="text-sm text-[var(--color-text-secondary)] px-3 py-2 border border-[var(--color-border)] rounded-[6px] bg-[var(--color-surface)]"
              aria-label="Rol asignado: Doctor"
            >
              Doctor
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              Los profesionales reciben el rol Doctor automáticamente.
            </p>
          </div>

          <p className="mb-4 text-xs text-[var(--color-text-secondary)]">
            Se enviará un email de invitación al profesional para que establezca su contraseña.
          </p>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className={[
                'px-4 py-2 rounded-[6px] text-sm border min-h-[36px]',
                'border-[var(--color-border)] text-[var(--color-text-secondary)]',
                'hover:bg-[var(--color-surface)] transition-colors',
                'disabled:opacity-50',
              ].join(' ')}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className={[
                'px-4 py-2 rounded-[8px] text-sm font-medium min-h-[36px]',
                'bg-[var(--color-interactive)] text-white',
                'hover:opacity-90 transition-opacity',
                'disabled:opacity-50',
              ].join(' ')}
            >
              {isPending ? 'Creando...' : 'Crear cuenta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
