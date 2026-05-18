'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useProfessionals } from '@/hooks/use-professionals'
import { useCreateProfessional } from '@/hooks/use-create-professional'
import { useUpdateProfessional } from '@/hooks/use-update-professional'
import { useUpdateProfessionalServices } from '@/hooks/use-update-professional-services'
import { useServices } from '@/hooks/use-services'
import {
  CreateProfessionalSchema,
  type CreateProfessionalFormValues,
} from '@/lib/schemas/profesionales.schema'
import type { Professional } from '@/types/profesionales'
import { ProfessionalScheduleView } from '@/components/profesionales/ProfessionalScheduleView'
import { BlockedTimesView } from '@/components/profesionales/BlockedTimesView'
import { CreateUserModal } from '@/components/profesionales/CreateUserModal'

// ── Skeleton ─────────────────────────────────────────────────────────────────

function ProfesionalesSkeleton() {
  return (
    <div role="status" aria-label="Cargando profesionales" className="animate-pulse space-y-2">
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

function CreateProfessionalForm({ onCancel }: CreateFormProps) {
  const createProfessional = useCreateProfessional()
  const { services } = useServices()

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateProfessionalFormValues>({
    resolver: standardSchemaResolver(CreateProfessionalSchema),
    defaultValues: {
      name: '',
      email: '',
      service_ids: [],
    },
  })

  const selectedServiceIds = watch('service_ids') ?? []

  const toggleService = (serviceId: string) => {
    const current = selectedServiceIds
    if (current.includes(serviceId)) {
      setValue('service_ids', current.filter((id) => id !== serviceId))
    } else {
      setValue('service_ids', [...current, serviceId])
    }
  }

  const onSubmit = async (data: CreateProfessionalFormValues) => {
    createProfessional.mutate(
      {
        name: data.name,
        email: data.email,
        service_ids: data.service_ids?.length ? data.service_ids : undefined,
      },
      {
        onSuccess: () => {
          reset()
          onCancel()
        },
      }
    )
  }

  const isPending = createProfessional.isPending || isSubmitting

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      aria-label="Formulario de nuevo profesional"
      className="border border-[var(--color-border)] rounded-[8px] p-4 space-y-3 bg-[var(--color-surface)]"
    >
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Nuevo profesional</h3>

      <div>
        <label htmlFor="create-prof-name" className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
          Nombre <span aria-hidden="true">*</span>
        </label>
        <input
          id="create-prof-name"
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
        <label htmlFor="create-prof-email" className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
          Email <span aria-hidden="true">*</span>
        </label>
        <input
          id="create-prof-email"
          type="email"
          {...register('email')}
          className={[
            'w-full px-3 py-2 rounded-[8px] border text-sm',
            'bg-[var(--color-bg)] text-[var(--color-text-primary)]',
            'focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]',
            errors.email ? 'border-red-400' : 'border-[var(--color-border)]',
          ].join(' ')}
          aria-invalid={!!errors.email}
        />
        {errors.email && (
          <p role="alert" className="mt-1 text-xs text-red-600">{errors.email.message}</p>
        )}
      </div>

      {services.length > 0 && (
        <div>
          <p className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
            Servicios <span className="text-[var(--color-text-secondary)] font-normal">(opcional)</span>
          </p>
          <div className="space-y-1.5">
            {services.map((service) => (
              <label key={service.service_id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  value={service.service_id}
                  checked={selectedServiceIds.includes(service.service_id)}
                  onChange={() => toggleService(service.service_id)}
                  className="rounded border-[var(--color-border)]"
                />
                <span className="text-sm text-[var(--color-text-primary)]">{service.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

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
  professional: Professional
  onCancel: () => void
}

function EditProfessionalForm({ professional, onCancel }: EditFormProps) {
  const updateProfessional = useUpdateProfessional()
  const updateServices = useUpdateProfessionalServices()
  const { services } = useServices()

  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>(
    professional.services.map((s) => s.service_id)
  )

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      name: professional.name,
      email: professional.email,
    },
  })

  const toggleService = (serviceId: string) => {
    setSelectedServiceIds((prev) =>
      prev.includes(serviceId)
        ? prev.filter((id) => id !== serviceId)
        : [...prev, serviceId]
    )
  }

  const onSubmit = async (data: { name: string; email: string }) => {
    updateProfessional.mutate(
      { id: professional.professional_id, payload: { name: data.name, email: data.email } },
      {
        onSuccess: () => {
          updateServices.mutate(
            { id: professional.professional_id, service_ids: selectedServiceIds },
            { onSuccess: onCancel }
          )
        },
      }
    )
  }

  const isPending = updateProfessional.isPending || updateServices.isPending || isSubmitting

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      aria-label={`Editar profesional ${professional.name}`}
      className="border border-[var(--color-interactive)] rounded-[8px] p-4 space-y-3 bg-[var(--color-surface)]"
    >
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Editar profesional</h3>

      <div>
        <label htmlFor={`edit-prof-name-${professional.professional_id}`} className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
          Nombre <span aria-hidden="true">*</span>
        </label>
        <input
          id={`edit-prof-name-${professional.professional_id}`}
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
        <label htmlFor={`edit-prof-email-${professional.professional_id}`} className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
          Email <span aria-hidden="true">*</span>
        </label>
        <input
          id={`edit-prof-email-${professional.professional_id}`}
          type="email"
          {...register('email')}
          className={[
            'w-full px-3 py-2 rounded-[8px] border text-sm',
            'bg-[var(--color-bg)] text-[var(--color-text-primary)]',
            'focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]',
            errors.email ? 'border-red-400' : 'border-[var(--color-border)]',
          ].join(' ')}
          aria-invalid={!!errors.email}
        />
        {errors.email && (
          <p role="alert" className="mt-1 text-xs text-red-600">{errors.email.message}</p>
        )}
      </div>

      {services.length > 0 && (
        <div>
          <p className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">Servicios</p>
          <div className="space-y-1.5">
            {services.map((service) => (
              <label key={service.service_id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  value={service.service_id}
                  checked={selectedServiceIds.includes(service.service_id)}
                  onChange={() => toggleService(service.service_id)}
                  className="rounded border-[var(--color-border)]"
                />
                <span className="text-sm text-[var(--color-text-primary)]">{service.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

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

// ── Fila de Profesional ───────────────────────────────────────────────────────

interface ProfessionalRowProps {
  professional: Professional
  isEditing: boolean
  isConfirmingDeactivate: boolean
  openSchedulesFor: string | null
  onEdit: () => void
  onCancelEdit: () => void
  onToggleActive: () => void
  onRequestDeactivate: () => void
  onCancelDeactivate: () => void
  onToggleSchedules: (id: string) => void
  onCreateUser: () => void
}

function ProfessionalRow({
  professional,
  isEditing,
  isConfirmingDeactivate,
  openSchedulesFor,
  onEdit,
  onCancelEdit,
  onToggleActive,
  onRequestDeactivate,
  onCancelDeactivate,
  onToggleSchedules,
  onCreateUser,
}: ProfessionalRowProps) {
  const isSchedulesOpen = openSchedulesFor === professional.professional_id

  if (isEditing) {
    return (
      <li>
        <EditProfessionalForm professional={professional} onCancel={onCancelEdit} />
      </li>
    )
  }

  return (
    <li className="border border-[var(--color-border)] rounded-[8px] overflow-hidden">
      <div className="flex items-center justify-between gap-4 p-3 bg-[var(--color-bg)]">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{professional.name}</p>
          <p className="text-xs text-[var(--color-text-secondary)] truncate">{professional.email}</p>
          {professional.services.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {professional.services.map((s) => (
                <span
                  key={s.service_id}
                  className="inline-block px-2 py-0.5 rounded text-xs bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)]"
                >
                  {s.name}
                </span>
              ))}
            </div>
          )}
          {professional.linked_user_email ? (
            <p
              className="mt-1 text-xs text-[var(--color-status-ok)]"
              data-testid={`linked-user-email-${professional.professional_id}`}
            >
              Cuenta: {professional.linked_user_email}
            </p>
          ) : (
            <button
              type="button"
              onClick={onCreateUser}
              className="mt-1 text-xs text-[var(--color-interactive)] hover:underline font-medium"
              data-testid={`create-user-btn-${professional.professional_id}`}
            >
              + Crear cuenta de usuario
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span
            className="text-xs font-medium"
            style={{
              color: professional.active ? 'var(--color-status-ok)' : 'var(--color-status-alert)',
            }}
          >
            {professional.active ? 'Activo' : 'Inactivo'}
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
              onClick={professional.active ? onRequestDeactivate : onToggleActive}
              className={[
                'text-xs px-3 py-1.5 rounded-[6px] border min-h-[32px] transition-colors',
                professional.active
                  ? 'border-[var(--color-status-alert)] text-[var(--color-status-alert)] hover:bg-red-50'
                  : 'border-[var(--color-status-ok)] text-[var(--color-status-ok)] hover:bg-green-50',
              ].join(' ')}
            >
              {professional.active ? 'Desactivar' : 'Reactivar'}
            </button>
          )}
          <button
            type="button"
            onClick={() => onToggleSchedules(professional.professional_id)}
            className="text-[var(--color-interactive)] text-xs font-medium hover:underline min-h-[32px] px-2"
            aria-expanded={isSchedulesOpen}
            aria-controls={`schedules-panel-${professional.professional_id}`}
          >
            {isSchedulesOpen ? 'Cerrar horarios' : 'Horarios'}
          </button>
        </div>
      </div>

      {isSchedulesOpen && (
        <div
          id={`schedules-panel-${professional.professional_id}`}
          className="border-t border-[var(--color-border)] p-4 bg-[var(--color-surface)] space-y-4"
        >
          <ProfessionalScheduleView
            professionalId={professional.professional_id}
            professionalName={professional.name}
          />
          <BlockedTimesView
            professionalId={professional.professional_id}
            professionalName={professional.name}
          />
        </div>
      )}
    </li>
  )
}

// ── Componente Principal ──────────────────────────────────────────────────────

export function ProfesionalesView() {
  const { professionals, isPending, isError, refetch } = useProfessionals()
  const updateProfessional = useUpdateProfessional()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [openSchedulesFor, setOpenSchedulesFor] = useState<string | null>(null)
  const [creatingUserFor, setCreatingUserFor] = useState<string | null>(null)

  const handleToggleSchedules = (id: string) => {
    setOpenSchedulesFor((prev) => (prev === id ? null : id))
  }

  if (isPending) {
    return <ProfesionalesSkeleton />
  }

  if (isError) {
    return (
      <div
        role="alert"
        className="flex items-center gap-3 p-4 bg-[var(--color-surface)] rounded-[8px] border border-[var(--color-border)]"
      >
        <span className="text-[var(--color-text-secondary)]">
          No se pudieron cargar los profesionales.
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
    <section aria-label="Profesionales de la clínica" className="space-y-4">
      {professionals.length === 0 && !showCreateForm && (
        <p className="text-[var(--color-text-secondary)] text-sm">No hay profesionales configurados</p>
      )}

      {professionals.length > 0 && (
        <ul role="list" className="space-y-2">
          {professionals.map((professional) => (
            <ProfessionalRow
              key={professional.professional_id}
              professional={professional}
              isEditing={editingId === professional.professional_id}
              isConfirmingDeactivate={confirmingId === professional.professional_id}
              openSchedulesFor={openSchedulesFor}
              onEdit={() => setEditingId(professional.professional_id)}
              onCancelEdit={() => setEditingId(null)}
              onToggleActive={() => {
                updateProfessional.mutate({
                  id: professional.professional_id,
                  payload: { active: !professional.active },
                })
                setConfirmingId(null)
              }}
              onRequestDeactivate={() => setConfirmingId(professional.professional_id)}
              onCancelDeactivate={() => setConfirmingId(null)}
              onToggleSchedules={handleToggleSchedules}
              onCreateUser={() => setCreatingUserFor(professional.professional_id)}
            />
          ))}
        </ul>
      )}

      {showCreateForm ? (
        <CreateProfessionalForm onCancel={() => setShowCreateForm(false)} />
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
          Nuevo profesional
        </button>
      )}

      {creatingUserFor && (() => {
        const prof = professionals.find(p => p.professional_id === creatingUserFor)
        if (!prof) return null
        return (
          <CreateUserModal
            professionalId={creatingUserFor}
            professionalName={prof.name}
            onClose={() => setCreatingUserFor(null)}
          />
        )
      })()}
    </section>
  )
}
