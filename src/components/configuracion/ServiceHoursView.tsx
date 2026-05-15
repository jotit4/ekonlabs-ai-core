'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useServiceHours } from '@/hooks/use-service-hours'
import { useCreateServiceHour } from '@/hooks/use-create-service-hour'
import { useDeleteServiceHour } from '@/hooks/use-delete-service-hour'
import { useServiceExceptions } from '@/hooks/use-service-exceptions'
import { useCreateServiceException } from '@/hooks/use-create-service-exception'
import { useDeleteServiceException } from '@/hooks/use-delete-service-exception'
import {
  CreateServiceHourSchema,
  CreateServiceExceptionSchema,
  type CreateServiceHourFormValues,
  type CreateServiceExceptionFormValues,
} from '@/lib/schemas/servicios.schema'

// ── Constantes ────────────────────────────────────────────────────────────────

const DAY_NAMES: Record<number, string> = {
  0: 'Domingo',
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
}

function displayTime(time: string): string {
  return time.slice(0, 5)
}

// ── Skeletons ─────────────────────────────────────────────────────────────────

function HorariosListSkeleton() {
  return (
    <div role="status" aria-label="Cargando horarios" className="animate-pulse space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-10 bg-[var(--color-surface)] rounded-[8px]" />
      ))}
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ServiceHoursViewProps {
  serviceId: string
  serviceName: string
}

// ── Formulario de horario ─────────────────────────────────────────────────────

function AddServiceHourForm({ serviceId }: { serviceId: string }) {
  const createHour = useCreateServiceHour(serviceId)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateServiceHourFormValues>({
    resolver: standardSchemaResolver(CreateServiceHourSchema),
    defaultValues: { day_of_week: 1, start_time: '09:00', end_time: '18:00', slot_duration_minutes: 30 },
  })

  const onSubmit = (data: CreateServiceHourFormValues) => {
    createHour.mutate(
      { ...data, day_of_week: data.day_of_week as 0 | 1 | 2 | 3 | 4 | 5 | 6 },
      { onSuccess: () => reset() }
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3 pt-4 border-t border-[var(--color-border)]">
      <p className="text-sm font-medium text-[var(--color-text-primary)]">Agregar horario</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Día de la semana */}
        <div>
          <label htmlFor="day_of_week" className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
            Día
          </label>
          <select
            id="day_of_week"
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
          <label htmlFor="start_time" className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
            Hora inicio
          </label>
          <input
            id="start_time"
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
          <label htmlFor="end_time" className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
            Hora fin
          </label>
          <input
            id="end_time"
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

        {/* Duración de slot */}
        <div>
          <label htmlFor="slot_duration_minutes" className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
            Duración (min)
          </label>
          <input
            id="slot_duration_minutes"
            type="number"
            min={5}
            max={480}
            {...register('slot_duration_minutes', { valueAsNumber: true })}
            className={[
              'w-full px-2 py-1.5 rounded-[8px] border text-sm',
              'bg-[var(--color-bg)] text-[var(--color-text-primary)]',
              'focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]',
              errors.slot_duration_minutes ? 'border-red-400' : 'border-[var(--color-border)]',
            ].join(' ')}
          />
          {errors.slot_duration_minutes && (
            <p role="alert" className="mt-1 text-xs text-red-600">{errors.slot_duration_minutes.message}</p>
          )}
        </div>
      </div>

      <button
        type="submit"
        disabled={createHour.isPending}
        className={[
          'px-4 py-2 rounded-[8px] text-sm font-medium',
          'bg-[var(--color-interactive)] text-white',
          'hover:opacity-90 transition-opacity min-h-[36px]',
          createHour.isPending ? 'opacity-50 cursor-not-allowed' : '',
        ].join(' ')}
      >
        {createHour.isPending ? 'Agregando...' : 'Agregar horario'}
      </button>
    </form>
  )
}

// ── Formulario de excepción ───────────────────────────────────────────────────

function AddServiceExceptionForm({ serviceId }: { serviceId: string }) {
  const createException = useCreateServiceException(serviceId)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateServiceExceptionFormValues>({
    resolver: standardSchemaResolver(CreateServiceExceptionSchema),
    defaultValues: { exception_date: '', reason: '' },
  })

  const onSubmit = (data: CreateServiceExceptionFormValues) => {
    createException.mutate(data, {
      onSuccess: () => reset(),
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3 pt-4 border-t border-[var(--color-border)]">
      <p className="text-sm font-medium text-[var(--color-text-primary)]">Agregar cierre / feriado</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Fecha */}
        <div>
          <label htmlFor="exception_date" className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
            Fecha
          </label>
          <input
            id="exception_date"
            type="date"
            {...register('exception_date')}
            className={[
              'w-full px-2 py-1.5 rounded-[8px] border text-sm',
              'bg-[var(--color-bg)] text-[var(--color-text-primary)]',
              'focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]',
              errors.exception_date ? 'border-red-400' : 'border-[var(--color-border)]',
            ].join(' ')}
          />
          {errors.exception_date && (
            <p role="alert" className="mt-1 text-xs text-red-600">{errors.exception_date.message}</p>
          )}
        </div>

        {/* Motivo */}
        <div>
          <label htmlFor="reason" className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
            Motivo (opcional)
          </label>
          <input
            id="reason"
            type="text"
            {...register('reason')}
            placeholder="Ej: Feriado nacional"
            className={[
              'w-full px-2 py-1.5 rounded-[8px] border text-sm',
              'bg-[var(--color-bg)] text-[var(--color-text-primary)]',
              'focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]',
              errors.reason ? 'border-red-400' : 'border-[var(--color-border)]',
            ].join(' ')}
          />
          {errors.reason && (
            <p role="alert" className="mt-1 text-xs text-red-600">{errors.reason.message}</p>
          )}
        </div>
      </div>

      <button
        type="submit"
        disabled={createException.isPending}
        className={[
          'px-4 py-2 rounded-[8px] text-sm font-medium',
          'bg-[var(--color-interactive)] text-white',
          'hover:opacity-90 transition-opacity min-h-[36px]',
          createException.isPending ? 'opacity-50 cursor-not-allowed' : '',
        ].join(' ')}
      >
        {createException.isPending ? 'Agregando...' : 'Agregar excepción'}
      </button>
    </form>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export function ServiceHoursView({ serviceId }: ServiceHoursViewProps) {
  const { hours, isPending: hoursPending, isError: hoursError, refetch: refetchHours } = useServiceHours(serviceId)
  const { exceptions, isPending: exceptionsPending, isError: exceptionsError, refetch: refetchExceptions } = useServiceExceptions(serviceId)
  const deleteHour = useDeleteServiceHour()
  const deleteException = useDeleteServiceException()
  const [deletingHourId, setDeletingHourId] = useState<string | null>(null)

  return (
    <section aria-label="Horarios de atención" className="space-y-6">
      {/* ── Sección horarios regulares ─────────────────────────────────────── */}
      <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[8px] p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Horarios regulares</h2>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
            Horarios en timezone America/Argentina/Buenos_Aires
          </p>
        </div>

        {hoursPending && <HorariosListSkeleton />}

        {hoursError && !hoursPending && (
          <div
            role="alert"
            className="flex items-center gap-3 p-4 bg-[var(--color-surface)] rounded-[8px] border border-[var(--color-border)]"
          >
            <span className="text-[var(--color-text-secondary)] text-sm">
              No se pudieron cargar los horarios.
            </span>
            <button
              onClick={() => refetchHours()}
              className="text-[var(--color-interactive)] text-sm font-medium hover:underline"
            >
              Reintentar
            </button>
          </div>
        )}

        {!hoursPending && !hoursError && (
          <>
            {hours.length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">
                No hay horarios configurados para este servicio
              </p>
            ) : (
              <ul role="list" className="divide-y divide-[var(--color-border)]">
                {hours.map((hour) => (
                  <li
                    key={hour.hour_id}
                    className="flex items-center justify-between py-3"
                  >
                    <div className="flex items-center gap-4 text-sm">
                      <span className="font-medium text-[var(--color-text-primary)] w-24">
                        {DAY_NAMES[hour.day_of_week]}
                      </span>
                      <span className="text-[var(--color-text-secondary)]">
                        {displayTime(hour.start_time)} – {displayTime(hour.end_time)}
                      </span>
                      <span className="text-[var(--color-text-secondary)]">
                        {hour.slot_duration_minutes} min/slot
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setDeletingHourId(hour.hour_id)
                        deleteHour.mutate(
                          { serviceId, hourId: hour.hour_id },
                          { onSettled: () => setDeletingHourId(null) }
                        )
                      }}
                      disabled={deletingHourId === hour.hour_id && deleteHour.isPending}
                      className="text-[var(--color-status-alert)] text-sm font-medium hover:underline disabled:opacity-50"
                      aria-label={`Eliminar horario ${DAY_NAMES[hour.day_of_week]}`}
                    >
                      Eliminar
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <AddServiceHourForm serviceId={serviceId} />
          </>
        )}
      </div>

      {/* ── Sección excepciones ───────────────────────────────────────────── */}
      <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[8px] p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Cierres y feriados</h2>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
            Excepciones que bloquean la agenda en fechas específicas
          </p>
        </div>

        {exceptionsPending && (
          <div role="status" aria-label="Cargando excepciones" className="animate-pulse space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-10 bg-[var(--color-surface)] rounded-[8px]" />
            ))}
          </div>
        )}

        {exceptionsError && !exceptionsPending && (
          <div
            role="alert"
            className="flex items-center gap-3 p-4 bg-[var(--color-surface)] rounded-[8px] border border-[var(--color-border)]"
          >
            <span className="text-[var(--color-text-secondary)] text-sm">
              No se pudieron cargar las excepciones.
            </span>
            <button
              onClick={() => refetchExceptions()}
              className="text-[var(--color-interactive)] text-sm font-medium hover:underline"
            >
              Reintentar
            </button>
          </div>
        )}

        {!exceptionsPending && !exceptionsError && (
          <>
            {exceptions.length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">
                No hay excepciones configuradas
              </p>
            ) : (
              <ul role="list" className="divide-y divide-[var(--color-border)]">
                {exceptions.map((exc) => (
                  <li
                    key={exc.exception_id}
                    className="flex items-center justify-between py-3"
                  >
                    <div className="flex items-center gap-4 text-sm">
                      <span className="font-medium text-[var(--color-text-primary)]">
                        {exc.exception_date}
                      </span>
                      {exc.reason && (
                        <span className="text-[var(--color-text-secondary)]">{exc.reason}</span>
                      )}
                    </div>
                    <button
                      onClick={() => deleteException.mutate({ serviceId, exceptionId: exc.exception_id })}
                      disabled={deleteException.isPending}
                      className="text-[var(--color-status-alert)] text-sm font-medium hover:underline disabled:opacity-50"
                      aria-label={`Eliminar excepción ${exc.exception_date}`}
                    >
                      Eliminar
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <AddServiceExceptionForm serviceId={serviceId} />
          </>
        )}
      </div>
    </section>
  )
}
