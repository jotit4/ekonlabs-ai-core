'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Dialog } from '@base-ui/react/dialog'
import { rescheduleSchema, type RescheduleFormValues } from '@/lib/schemas/reschedule.schema'
import { generateTimeSlots } from '@/lib/utils/time-slots'
import type { Appointment } from '@/types/appointments'

interface RescheduleTurnoModalProps {
  open: boolean
  onClose: () => void
  appointment: Appointment | null
  date: string // ISO date YYYY-MM-DD — para invalidar queryKey correcta
}

export function RescheduleTurnoModal({
  open,
  onClose,
  appointment,
  date,
}: RescheduleTurnoModalProps) {
  const queryClient = useQueryClient()
  const [slotConflictError, setSlotConflictError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const durationMinutes = appointment?.services?.duration_minutes ?? 60
  const timeSlots = generateTimeSlots(durationMinutes)
  const today = new Date().toLocaleDateString('en-CA')

  // Calcular valores por defecto a partir del appointment actual
  const defaultDate = appointment?.start_at
    ? format(parseISO(appointment.start_at), 'yyyy-MM-dd')
    : date
  const defaultTime = appointment?.start_at
    ? format(parseISO(appointment.start_at), 'HH:mm')
    : ''

  const form = useForm<RescheduleFormValues>({
    resolver: standardSchemaResolver(rescheduleSchema),
    defaultValues: {
      appointment_date: defaultDate,
      appointment_time_hhmm: defaultTime,
    },
  })

  // Fix A-13: resetear form cuando el appointment cambia (turno A → turno B)
  useEffect(() => {
    if (!appointment) return
    const newDefaultDate = appointment.start_at
      ? format(parseISO(appointment.start_at), 'yyyy-MM-dd')
      : date
    const newDefaultTime = appointment.start_at
      ? format(parseISO(appointment.start_at), 'HH:mm')
      : ''
    form.reset({
      appointment_date: newDefaultDate,
      appointment_time_hhmm: newDefaultTime,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointment?.appointment_id])

  const handleClose = () => {
    setSlotConflictError(null)
    setSubmitError(null)
    form.reset()
    onClose()
  }

  const handleSubmit = async (values: RescheduleFormValues) => {
    if (!appointment) return
    setSlotConflictError(null)
    setSubmitError(null)

    // Fix C-05: construir string ISO con offset explícito (-03:00 = Argentina)
    const startAtStr = `${values.appointment_date}T${values.appointment_time_hhmm}:00-03:00`
    const startAt = new Date(startAtStr)
    const endAt = new Date(startAt.getTime() + durationMinutes * 60 * 1000)

    try {
      const response = await fetch(`/api/appointments/${appointment.appointment_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_at: startAtStr,
          end_at: endAt.toISOString(),
        }),
      })

      if (response.status === 409) {
        setSlotConflictError('Ese horario ya no está disponible')
        return
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        setSubmitError((body as { error?: string }).error ?? 'Error al reprogramar el turno')
        return
      }

      // Éxito — invalidar query del día nuevo y del día actual
      queryClient.invalidateQueries({ queryKey: ['agenda', 'day', date] })
      queryClient.invalidateQueries({ queryKey: ['agenda', 'day', values.appointment_date] })
      handleClose()
    } catch {
      setSubmitError('Error de red. Verificá tu conexión e intentá de nuevo.')
    }
  }

  const inputClass = (hasError: boolean) =>
    [
      'w-full px-3 py-2 rounded-[8px] border text-sm',
      'bg-[var(--color-bg)] text-[var(--color-text-primary)]',
      'focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]',
      hasError ? 'border-red-400' : 'border-[var(--color-border)]',
    ].join(' ')

  const patientName = appointment?.patients?.full_name ?? 'Paciente'

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose() }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/50 z-40" />
        <Dialog.Popup
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          aria-modal="true"
          aria-labelledby="reschedule-turno-title"
        >
          <div className="bg-[var(--color-bg)] rounded-[12px] shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-[var(--color-border)]">
              <Dialog.Title
                id="reschedule-turno-title"
                className="text-lg font-semibold text-[var(--color-text-primary)]"
              >
                Reprogramar turno de {patientName}
              </Dialog.Title>
            </div>

            {/* Body */}
            <form
              id="reschedule-form"
              onSubmit={form.handleSubmit(handleSubmit)}
              noValidate
              className="px-6 py-4 space-y-4"
              aria-label="Reprogramar turno"
            >
              {/* Fecha */}
              <div>
                <label
                  htmlFor="reschedule-date"
                  className="block text-sm font-medium text-[var(--color-text-primary)] mb-1"
                >
                  Nueva fecha
                </label>
                <input
                  id="reschedule-date"
                  type="date"
                  min={today}
                  {...form.register('appointment_date')}
                  className={inputClass(!!form.formState.errors.appointment_date)}
                  aria-invalid={!!form.formState.errors.appointment_date}
                  aria-describedby={
                    form.formState.errors.appointment_date ? 'reschedule-date-error' : undefined
                  }
                />
                {form.formState.errors.appointment_date && (
                  <p id="reschedule-date-error" role="alert" className="mt-1 text-xs text-red-600">
                    {form.formState.errors.appointment_date.message}
                  </p>
                )}
              </div>

              {/* Horario */}
              <div>
                <label
                  htmlFor="reschedule-time"
                  className="block text-sm font-medium text-[var(--color-text-primary)] mb-1"
                >
                  Nuevo horario
                </label>
                <select
                  id="reschedule-time"
                  {...form.register('appointment_time_hhmm')}
                  className={inputClass(
                    !!form.formState.errors.appointment_time_hhmm || !!slotConflictError,
                  )}
                  aria-invalid={
                    !!form.formState.errors.appointment_time_hhmm || !!slotConflictError
                  }
                  aria-describedby={
                    slotConflictError
                      ? 'reschedule-slot-error'
                      : form.formState.errors.appointment_time_hhmm
                        ? 'reschedule-time-error'
                        : undefined
                  }
                >
                  <option value="">Seleccioná un horario</option>
                  {timeSlots.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
                {form.formState.errors.appointment_time_hhmm && !slotConflictError && (
                  <p id="reschedule-time-error" role="alert" className="mt-1 text-xs text-red-600">
                    {form.formState.errors.appointment_time_hhmm.message}
                  </p>
                )}
                {slotConflictError && (
                  <p id="reschedule-slot-error" role="alert" className="mt-1 text-xs text-red-600">
                    {slotConflictError}
                  </p>
                )}
              </div>

              {/* Error genérico */}
              {submitError && (
                <p role="alert" className="text-xs text-red-600">
                  {submitError}
                </p>
              )}
            </form>

            {/* Footer */}
            <div className="px-6 pb-6 pt-2 flex justify-end gap-3 border-t border-[var(--color-border)]">
              <Dialog.Close
                onClick={handleClose}
                className={[
                  'px-4 py-2 rounded-[8px] text-sm font-medium min-h-[44px]',
                  'text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] transition-colors',
                ].join(' ')}
              >
                Cancelar
              </Dialog.Close>
              <button
                type="submit"
                form="reschedule-form"
                disabled={form.formState.isSubmitting}
                className={[
                  'px-4 py-2 rounded-[8px] text-sm font-medium min-h-[44px]',
                  'bg-[var(--color-interactive)] text-white',
                  'hover:opacity-90 transition-opacity',
                  form.formState.isSubmitting ? 'opacity-50 cursor-not-allowed' : '',
                ].join(' ')}
              >
                {form.formState.isSubmitting ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
