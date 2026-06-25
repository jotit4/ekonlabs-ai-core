'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useProfessionalSchedules } from '@/hooks/use-professional-schedules'
import { useCreateProfessionalSchedule } from '@/hooks/use-create-professional-schedule'
import { useDeleteProfessionalSchedule } from '@/hooks/use-delete-professional-schedule'
import {
  CreateProfessionalScheduleSchema,
  type CreateProfessionalScheduleFormValues,
} from '@/lib/schemas/profesionales-horarios.schema'

// ── Constantes ────────────────────────────────────────────────────────────────

// CRÍTICO: day_of_week usa notación ISO (0=Lunes … 6=Domingo)
// DIFERENTE de service_hours donde 0=Domingo
const DAY_NAMES: Record<number, string> = {
  0: 'Lunes',
  1: 'Martes',
  2: 'Miércoles',
  3: 'Jueves',
  4: 'Viernes',
  5: 'Sábado',
  6: 'Domingo',
}

function displayTime(time: string): string {
  return time.slice(0, 5)
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function ProfessionalScheduleSkeleton() {
  return (
    <div role="status" aria-label="Cargando horarios del profesional" className="animate-pulse space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-10 bg-[var(--color-surface)] rounded-[8px]" />
      ))}
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ProfessionalScheduleViewProps {
  professionalId: string
  professionalName: string
}

// ── Formulario de horario ─────────────────────────────────────────────────────

function AddProfessionalScheduleForm({ professionalId }: { professionalId: string }) {
  const createSchedule = useCreateProfessionalSchedule(professionalId)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateProfessionalScheduleFormValues>({
    resolver: standardSchemaResolver(CreateProfessionalScheduleSchema),
    defaultValues: { day_of_week: 0, start_time: '09:00', end_time: '18:00' },
  })

  const onSubmit = (data: CreateProfessionalScheduleFormValues) => {
    createSchedule.mutate(
      { ...data, day_of_week: data.day_of_week as 0 | 1 | 2 | 3 | 4 | 5 | 6 },
      { onSuccess: () => reset() }
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3 pt-4 border-t border-[var(--color-border)]">
      <p className="text-sm font-medium text-[var(--color-text-primary)]">Agregar horario</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Día de la semana */}
        <div>
          <label htmlFor="prof-day_of_week" className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
            Día
          </label>
          <select
            id="prof-day_of_week"
            {...register('day_of_week', { valueAsNumber: true })}
            className={[
              'w-full px-2 py-1.5 rounded-[8px] border text-sm',
              'bg-[var(--color-bg)] text-[var(--color-text-primary)]',
              'focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]',
              errors.day_of_week ? 'border-red-400' : 'border-[var(--color-border)]',
            ].join(' ')}
          >
            {Object.entries(DAY_NAMES).map(([num, name]) => (
              <option key={num} value={num}>{name}</option>
            ))}
          </select>
          {errors.day_of_week && (
            <p role="alert" className="mt-1 text-xs text-red-600">{errors.day_of_week.message}</p>
          )}
        </div>

        {/* Hora inicio */}
        <div>
          <label htmlFor="prof-start_time" className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
            Hora inicio
          </label>
          <input
            id="prof-start_time"
            type="time"
            {...register('start_time')}
            className={[
              'w-full px-2 py-1.5 rounded-[8px] border text-sm',
              'bg-[var(--color-bg)] text-[var(--color-text-primary)]',
              'focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]',
              errors.start_time ? 'border-red-400' : 'border-[var(--color-border)]',
            ].join(' ')}
          />
          {errors.start_time && (
            <p role="alert" className="mt-1 text-xs text-red-600">{errors.start_time.message}</p>
          )}
        </div>

        {/* Hora fin */}
        <div>
          <label htmlFor="prof-end_time" className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
            Hora fin
          </label>
          <input
            id="prof-end_time"
            type="time"
            {...register('end_time')}
            className={[
              'w-full px-2 py-1.5 rounded-[8px] border text-sm',
              'bg-[var(--color-bg)] text-[var(--color-text-primary)]',
              'focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]',
              errors.end_time ? 'border-red-400' : 'border-[var(--color-border)]',
            ].join(' ')}
          />
          {errors.end_time && (
            <p role="alert" className="mt-1 text-xs text-red-600">{errors.end_time.message}</p>
          )}
        </div>
      </div>

      <button
        type="submit"
        disabled={createSchedule.isPending}
        className={[
          'px-4 py-2 rounded-[8px] text-sm font-medium',
          'bg-[var(--color-interactive)] text-white',
          'hover:opacity-90 transition-opacity min-h-[36px]',
          createSchedule.isPending ? 'opacity-50 cursor-not-allowed' : '',
        ].join(' ')}
      >
        {createSchedule.isPending ? 'Agregando...' : 'Agregar horario'}
      </button>
    </form>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export function ProfessionalScheduleView({ professionalId, professionalName }: ProfessionalScheduleViewProps) {
  const { schedules, isPending, isError, refetch } = useProfessionalSchedules(professionalId)
  const deleteSchedule = useDeleteProfessionalSchedule()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  return (
    <section data-tour="disponibilidad-horarios" aria-label={`Horarios de ${professionalName}`} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[8px] p-5 space-y-4">
      <div>
        <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Horarios semanales</h3>
        <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
          Disponibilidad semanal recurrente del profesional
        </p>
      </div>

      {isPending && <ProfessionalScheduleSkeleton />}

      {isError && !isPending && (
        <div
          role="alert"
          className="flex items-center gap-3 p-4 bg-[var(--color-surface)] rounded-[8px] border border-[var(--color-border)]"
        >
          <span className="text-[var(--color-text-secondary)] text-sm">
            No se pudieron cargar los horarios.
          </span>
          <button
            onClick={() => refetch()}
            className="text-[var(--color-interactive)] text-sm font-medium hover:underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {!isPending && !isError && (
        <>
          {schedules.length === 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)]">
              No hay horarios configurados para este profesional
            </p>
          ) : (
            <ul role="list" className="divide-y divide-[var(--color-border)]">
              {schedules.map((schedule) => (
                <li
                  key={schedule.schedule_id}
                  className="flex items-center justify-between py-3"
                >
                  <div className="flex items-center gap-4 text-sm">
                    <span className="font-medium text-[var(--color-text-primary)] w-24">
                      {DAY_NAMES[schedule.day_of_week]}
                    </span>
                    <span className="text-[var(--color-text-secondary)]">
                      {displayTime(schedule.start_time)} – {displayTime(schedule.end_time)}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setDeletingId(schedule.schedule_id)
                      deleteSchedule.mutate(
                        { professionalId, scheduleId: schedule.schedule_id },
                        { onSettled: () => setDeletingId(null) }
                      )
                    }}
                    disabled={deletingId === schedule.schedule_id && deleteSchedule.isPending}
                    className="text-[var(--color-status-alert)] text-sm font-medium hover:underline disabled:opacity-50"
                    aria-label={`Eliminar horario ${DAY_NAMES[schedule.day_of_week]}`}
                  >
                    Eliminar
                  </button>
                </li>
              ))}
            </ul>
          )}

          <AddProfessionalScheduleForm professionalId={professionalId} />
        </>
      )}
    </section>
  )
}
