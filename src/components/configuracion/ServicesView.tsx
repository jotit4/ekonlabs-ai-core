'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useServices } from '@/hooks/use-services'
import { useCreateService } from '@/hooks/use-create-service'
import { useUpdateService } from '@/hooks/use-update-service'
import {
  CreateServiceSchema,
  UpdateServiceSchema,
  type CreateServiceFormValues,
  type UpdateServiceFormValues,
} from '@/lib/schemas/servicios.schema'
import type { Service } from '@/types/servicios'

// ── Skeleton ─────────────────────────────────────────────────────────────────

function ServicesSkeleton() {
  return (
    <div role="status" aria-label="Cargando servicios" className="animate-pulse space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-12 bg-[var(--color-surface)] rounded-[8px]" />
      ))}
    </div>
  )
}

// ── Formulario de Creación ────────────────────────────────────────────────────

interface CreateFormProps {
  onCancel: () => void
}

function CreateServiceForm({ onCancel }: CreateFormProps) {
  const createService = useCreateService()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateServiceFormValues>({
    resolver: standardSchemaResolver(CreateServiceSchema),
    defaultValues: {
      name: '',
      calendar_id: '',
      professional_name: '',
      duration_minutes: 60,
    },
  })

  const onSubmit = async (data: CreateServiceFormValues) => {
    const payload = {
      name: data.name,
      calendar_id: data.calendar_id,
      ...(data.professional_name ? { professional_name: data.professional_name } : {}),
      ...(data.duration_minutes !== undefined ? { duration_minutes: data.duration_minutes } : {}),
    }
    createService.mutate(payload, {
      onSuccess: () => {
        reset()
        onCancel()
      },
    })
  }

  const isPending = createService.isPending || isSubmitting

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      aria-label="Formulario de nuevo servicio"
      className="border border-[var(--color-border)] rounded-[8px] p-4 space-y-3 bg-[var(--color-surface)]"
    >
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Nuevo servicio</h3>

      <div>
        <label htmlFor="create-name" className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
          Nombre <span aria-hidden="true">*</span>
        </label>
        <input
          id="create-name"
          type="text"
          {...register('name')}
          className={[
            'w-full px-3 py-2 rounded-[8px] border text-sm',
            'bg-[var(--color-bg)] text-[var(--color-text-primary)]',
            'focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]',
            errors.name ? 'border-red-400' : 'border-[var(--color-border)]',
          ].join(' ')}
          aria-invalid={!!errors.name}
        />
        {errors.name && (
          <p role="alert" className="mt-1 text-xs text-red-600">{errors.name.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="create-calendar-id" className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
          ID del Calendario Google <span aria-hidden="true">*</span>
        </label>
        <input
          id="create-calendar-id"
          type="text"
          {...register('calendar_id')}
          placeholder="xxx@group.calendar.google.com"
          className={[
            'w-full px-3 py-2 rounded-[8px] border text-sm',
            'bg-[var(--color-bg)] text-[var(--color-text-primary)]',
            'focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]',
            errors.calendar_id ? 'border-red-400' : 'border-[var(--color-border)]',
          ].join(' ')}
          aria-invalid={!!errors.calendar_id}
        />
        {errors.calendar_id && (
          <p role="alert" className="mt-1 text-xs text-red-600">{errors.calendar_id.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="create-professional-name" className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
          Profesional <span className="text-[var(--color-text-secondary)] font-normal">(opcional)</span>
        </label>
        <input
          id="create-professional-name"
          type="text"
          {...register('professional_name')}
          className={[
            'w-full px-3 py-2 rounded-[8px] border text-sm',
            'bg-[var(--color-bg)] text-[var(--color-text-primary)]',
            'focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]',
            'border-[var(--color-border)]',
          ].join(' ')}
        />
      </div>

      <div>
        <label htmlFor="create-duration" className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
          Duración (minutos)
        </label>
        <input
          id="create-duration"
          type="number"
          min={5}
          max={480}
          {...register('duration_minutes', { valueAsNumber: true })}
          className={[
            'w-full px-3 py-2 rounded-[8px] border text-sm',
            'bg-[var(--color-bg)] text-[var(--color-text-primary)]',
            'focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]',
            errors.duration_minutes ? 'border-red-400' : 'border-[var(--color-border)]',
          ].join(' ')}
          aria-invalid={!!errors.duration_minutes}
        />
        {errors.duration_minutes && (
          <p role="alert" className="mt-1 text-xs text-red-600">{errors.duration_minutes.message}</p>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className={[
            'px-4 py-2 rounded-[8px] text-sm font-medium min-h-[36px]',
            'bg-[var(--color-interactive)] text-white',
            'hover:opacity-90 transition-opacity',
            isPending ? 'opacity-50 cursor-not-allowed' : '',
          ].join(' ')}
        >
          {isPending ? 'Guardando...' : 'Guardar'}
        </button>
        <button
          type="button"
          onClick={() => { reset(); onCancel() }}
          className={[
            'px-4 py-2 rounded-[8px] text-sm font-medium min-h-[36px]',
            'border border-[var(--color-border)] text-[var(--color-text-secondary)]',
            'hover:bg-[var(--color-surface)] transition-colors',
          ].join(' ')}
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}

// ── Formulario de Edición Inline ──────────────────────────────────────────────

interface EditFormProps {
  service: Service
  onCancel: () => void
}

function EditServiceForm({ service, onCancel }: EditFormProps) {
  const updateService = useUpdateService()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateServiceFormValues>({
    resolver: standardSchemaResolver(UpdateServiceSchema),
    defaultValues: {
      name: service.name,
      calendar_id: service.calendar_id,
      professional_name: service.professional_name ?? '',
      duration_minutes: service.duration_minutes,
    },
  })

  const onSubmit = async (data: UpdateServiceFormValues) => {
    const payload = {
      name: data.name,
      calendar_id: data.calendar_id,
      professional_name: data.professional_name || undefined,
      duration_minutes: data.duration_minutes,
    }
    updateService.mutate(
      { id: service.service_id, payload },
      { onSuccess: onCancel }
    )
  }

  const isPending = updateService.isPending || isSubmitting

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      aria-label={`Editar servicio ${service.name}`}
      className="border border-[var(--color-interactive)] rounded-[8px] p-4 space-y-3 bg-[var(--color-surface)]"
    >
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Editar servicio</h3>

      <div>
        <label htmlFor={`edit-name-${service.service_id}`} className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
          Nombre <span aria-hidden="true">*</span>
        </label>
        <input
          id={`edit-name-${service.service_id}`}
          type="text"
          {...register('name')}
          className={[
            'w-full px-3 py-2 rounded-[8px] border text-sm',
            'bg-[var(--color-bg)] text-[var(--color-text-primary)]',
            'focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]',
            errors.name ? 'border-red-400' : 'border-[var(--color-border)]',
          ].join(' ')}
          aria-invalid={!!errors.name}
        />
        {errors.name && (
          <p role="alert" className="mt-1 text-xs text-red-600">{errors.name.message}</p>
        )}
      </div>

      <div>
        <label htmlFor={`edit-calendar-${service.service_id}`} className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
          ID del Calendario Google <span aria-hidden="true">*</span>
        </label>
        <input
          id={`edit-calendar-${service.service_id}`}
          type="text"
          {...register('calendar_id')}
          className={[
            'w-full px-3 py-2 rounded-[8px] border text-sm',
            'bg-[var(--color-bg)] text-[var(--color-text-primary)]',
            'focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]',
            errors.calendar_id ? 'border-[var(--color-border)]' : 'border-[var(--color-border)]',
          ].join(' ')}
        />
      </div>

      <div>
        <label htmlFor={`edit-professional-${service.service_id}`} className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
          Profesional <span className="text-[var(--color-text-secondary)] font-normal">(opcional)</span>
        </label>
        <input
          id={`edit-professional-${service.service_id}`}
          type="text"
          {...register('professional_name')}
          className={[
            'w-full px-3 py-2 rounded-[8px] border text-sm',
            'bg-[var(--color-bg)] text-[var(--color-text-primary)]',
            'focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]',
            'border-[var(--color-border)]',
          ].join(' ')}
        />
      </div>

      <div>
        <label htmlFor={`edit-duration-${service.service_id}`} className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
          Duración (minutos)
        </label>
        <input
          id={`edit-duration-${service.service_id}`}
          type="number"
          min={5}
          max={480}
          {...register('duration_minutes', { valueAsNumber: true })}
          className={[
            'w-full px-3 py-2 rounded-[8px] border text-sm',
            'bg-[var(--color-bg)] text-[var(--color-text-primary)]',
            'focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]',
            'border-[var(--color-border)]',
          ].join(' ')}
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className={[
            'px-4 py-2 rounded-[8px] text-sm font-medium min-h-[36px]',
            'bg-[var(--color-interactive)] text-white',
            'hover:opacity-90 transition-opacity',
            isPending ? 'opacity-50 cursor-not-allowed' : '',
          ].join(' ')}
        >
          {isPending ? 'Guardando...' : 'Guardar'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={[
            'px-4 py-2 rounded-[8px] text-sm font-medium min-h-[36px]',
            'border border-[var(--color-border)] text-[var(--color-text-secondary)]',
            'hover:bg-[var(--color-surface)] transition-colors',
          ].join(' ')}
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}

// ── Fila de Servicio ──────────────────────────────────────────────────────────

interface ServiceRowProps {
  service: Service
  isEditing: boolean
  isConfirmingDeactivate: boolean
  onEdit: () => void
  onCancelEdit: () => void
  onToggleActive: () => void
  onRequestDeactivate: () => void
  onCancelDeactivate: () => void
}

function ServiceRow({
  service,
  isEditing,
  isConfirmingDeactivate,
  onEdit,
  onCancelEdit,
  onToggleActive,
  onRequestDeactivate,
  onCancelDeactivate,
}: ServiceRowProps) {
  if (isEditing) {
    return (
      <li>
        <EditServiceForm service={service} onCancel={onCancelEdit} />
      </li>
    )
  }

  return (
    <li className="flex items-center justify-between gap-4 p-3 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg)]">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{service.name}</p>
        <p className="text-xs text-[var(--color-text-secondary)]">
          {service.professional_name ?? '—'} · {service.duration_minutes}min · Cal: {service.calendar_id}
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span
          className="text-xs font-medium"
          style={{
            color: service.active ? 'var(--color-status-ok)' : 'var(--color-text-secondary)',
          }}
        >
          {service.active ? 'Activo' : 'Inactivo'}
        </span>
        <button
          type="button"
          onClick={onEdit}
          className={[
            'text-xs px-3 py-1.5 rounded-[6px] border min-h-[32px]',
            'border-[var(--color-border)] text-[var(--color-text-secondary)]',
            'hover:bg-[var(--color-surface)] transition-colors',
          ].join(' ')}
        >
          Editar
        </button>
        {isConfirmingDeactivate ? (
          <>
            <button
              type="button"
              onClick={onToggleActive}
              className={[
                'text-xs px-3 py-1.5 rounded-[6px] border min-h-[32px] transition-colors',
                'border-[var(--color-status-alert)] text-[var(--color-status-alert)] hover:bg-red-50',
              ].join(' ')}
            >
              ¿Confirmar?
            </button>
            <button
              type="button"
              onClick={onCancelDeactivate}
              className={[
                'text-xs px-3 py-1.5 rounded-[6px] border min-h-[32px]',
                'border-[var(--color-border)] text-[var(--color-text-secondary)]',
                'hover:bg-[var(--color-surface)] transition-colors',
              ].join(' ')}
            >
              Cancelar
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={service.active ? onRequestDeactivate : onToggleActive}
            className={[
              'text-xs px-3 py-1.5 rounded-[6px] border min-h-[32px] transition-colors',
              service.active
                ? 'border-[var(--color-status-alert)] text-[var(--color-status-alert)] hover:bg-red-50'
                : 'border-[var(--color-status-ok)] text-[var(--color-status-ok)] hover:bg-green-50',
            ].join(' ')}
          >
            {service.active ? 'Desactivar' : 'Reactivar'}
          </button>
        )}
      </div>
    </li>
  )
}

// ── Componente Principal ──────────────────────────────────────────────────────

export function ServicesView() {
  const { services, isPending, isError, refetch } = useServices()
  const updateService = useUpdateService()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)

  if (isPending) {
    return <ServicesSkeleton />
  }

  if (isError) {
    return (
      <div
        role="alert"
        className="flex items-center gap-3 p-4 bg-[var(--color-surface)] rounded-[8px] border border-[var(--color-border)]"
      >
        <span className="text-[var(--color-text-secondary)]">
          No se pudieron cargar los servicios.
        </span>
        <button
          onClick={() => refetch()}
          className="text-[var(--color-interactive)] text-sm font-medium hover:underline"
        >
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <section aria-label="Servicios del agente" className="space-y-4">
      {services.length === 0 && !showCreateForm && (
        <p className="text-[var(--color-text-secondary)] text-sm">No hay servicios configurados</p>
      )}

      {services.length > 0 && (
        <ul role="list" className="space-y-2">
          {services.map((service) => (
            <ServiceRow
              key={service.service_id}
              service={service}
              isEditing={editingId === service.service_id}
              isConfirmingDeactivate={confirmingId === service.service_id}
              onEdit={() => setEditingId(service.service_id)}
              onCancelEdit={() => setEditingId(null)}
              onToggleActive={() => {
                updateService.mutate({
                  id: service.service_id,
                  payload: { active: false },
                })
                setConfirmingId(null)
              }}
              onRequestDeactivate={() => setConfirmingId(service.service_id)}
              onCancelDeactivate={() => setConfirmingId(null)}
            />
          ))}
        </ul>
      )}

      {showCreateForm ? (
        <CreateServiceForm onCancel={() => setShowCreateForm(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setShowCreateForm(true)}
          className={[
            'px-4 py-2 rounded-[8px] text-sm font-medium min-h-[36px]',
            'bg-[var(--color-interactive)] text-white',
            'hover:opacity-90 transition-opacity',
          ].join(' ')}
        >
          Agregar servicio
        </button>
      )}
    </section>
  )
}
