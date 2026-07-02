'use client'

import { useState, useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Dialog } from '@base-ui/react/dialog'
import { rescheduleSchema, type RescheduleFormValues } from '@/lib/schemas/reschedule.schema'
import { useAvailability } from '@/hooks/use-availability'
import type { Appointment } from '@/types/appointments'

interface ProfessionalOption {
  professional_id: string
  name: string
}

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
  // Story 13.4 (corrección Medium): el selector lista SOLO los profesionales que
  // atienden el servicio del turno (vía /api/services/[serviceId]/profesionales),
  // NO todos los del tenant. Evita reasignar a un profesional que no da el servicio.
  const [profesionales, setProfesionales] = useState<ProfessionalOption[]>([])

  const serviceId = appointment?.service_id ?? null

  useEffect(() => {
    let cancelled = false
    // setState dentro del async IIFE para no disparar cascading renders síncronos
    // (regla react-hooks/set-state-in-effect — mismo patrón que NewTurnoModal).
    void (async () => {
      if (!open || !serviceId) {
        if (!cancelled) setProfesionales([])
        return
      }
      try {
        const res = await fetch(
          `/api/services/${encodeURIComponent(serviceId)}/profesionales`,
        )
        if (cancelled) return
        if (!res.ok) {
          setProfesionales([])
          return
        }
        const body = (await res.json()) as { data?: ProfessionalOption[] }
        if (!cancelled) setProfesionales(body.data ?? [])
      } catch {
        if (!cancelled) setProfesionales([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, serviceId])

  const durationMinutes = appointment?.services?.duration_minutes ?? 60
  const today = new Date().toLocaleDateString('en-CA')

  // Calcular valores por defecto a partir del appointment actual
  const defaultDate = appointment?.start_at
    ? format(parseISO(appointment.start_at), 'yyyy-MM-dd')
    : date
  const defaultTime = appointment?.start_at
    ? format(parseISO(appointment.start_at), 'HH:mm')
    : ''
  // Story 13.4 — profesional actual del turno como default del selector (opcional).
  const defaultProfessional = appointment?.professional_id ?? ''

  const form = useForm<RescheduleFormValues>({
    resolver: standardSchemaResolver(rescheduleSchema),
    defaultValues: {
      appointment_date: defaultDate,
      appointment_time_hhmm: defaultTime,
      professional_id: defaultProfessional,
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
      professional_id: appointment.professional_id ?? '',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointment?.appointment_id])

  // Story 13.4 (corrección Medium): el <select> de profesional se puebla async.
  // Cuando la lista del servicio llega y contiene al profesional actual del turno,
  // re-aplicar el valor para que quede pre-seleccionado (el reset corre antes de
  // que existan las <option>, por lo que el DOM caería a "Mantener profesional actual").
  useEffect(() => {
    const current = appointment?.professional_id
    if (!current) return
    if (profesionales.some((p) => p.professional_id === current)) {
      form.setValue('professional_id', current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profesionales, appointment?.professional_id])

  // P0.3 (BUG) — Reprogramar debe usar la disponibilidad REAL (RPC
  // check_clinic_availability vía /api/availability), no un rango 08–20 inventado.
  // El profesional a considerar es el elegido en el form (default = el actual del
  // turno). Solo se ofrecen huecos reales de ese profesional+servicio+fecha.
  const watchedDate = useWatch({ control: form.control, name: 'appointment_date' })
  const watchedProfessional = useWatch({ control: form.control, name: 'professional_id' })
  const effectiveProfessionalId =
    watchedProfessional && watchedProfessional.length > 0
      ? watchedProfessional
      : appointment?.professional_id ?? null

  const availabilityEnabled = !!serviceId && !!effectiveProfessionalId && !!watchedDate
  const {
    shiftsForDate,
    isLoading: isLoadingAvailability,
    isError: isAvailabilityError,
  } = useAvailability({
    dateFrom: watchedDate || '',
    dateTo: watchedDate || '',
    serviceId,
    professionalId: effectiveProfessionalId,
    enabled: availabilityEnabled,
  })

  // Huecos libres (HH:MM) reales. Nota: el propio turno ocupa su slot actual, por
  // lo que la hora original NO aparece como libre (reprogramar = mover a otra hora).
  const availableTimes = availabilityEnabled
    ? shiftsForDate(watchedDate).map((shift) => shift.open)
    : []

  // Limpiar la hora elegida si dejó de estar disponible (cambió fecha/profesional
  // o el hueco se ocupó). Solo cuando ya hay datos cargados para no borrar antes de
  // resolver la consulta.
  const watchedTime = useWatch({ control: form.control, name: 'appointment_time_hhmm' })
  useEffect(() => {
    if (!availabilityEnabled || isLoadingAvailability || isAvailabilityError) return
    if (watchedTime && !availableTimes.includes(watchedTime)) {
      form.setValue('appointment_time_hhmm', '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availabilityEnabled, isLoadingAvailability, isAvailabilityError, watchedTime, availableTimes.join(',')])

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

    // Story 13.4 — incluir professional_id en el body SOLO si el usuario lo cambió
    // respecto del actual (y no es vacío). Sin cambio → body idéntico al reschedule
    // actual (sin regresión para turnos sueltos).
    const body: { start_at: string; end_at: string; professional_id?: string } = {
      start_at: startAtStr,
      end_at: endAt.toISOString(),
    }
    const selectedProfessional = values.professional_id ?? ''
    if (selectedProfessional && selectedProfessional !== (appointment.professional_id ?? '')) {
      body.professional_id = selectedProfessional
    }

    try {
      const response = await fetch(`/api/appointments/${appointment.appointment_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (response.status === 409) {
        setSlotConflictError('Ese horario ya no está disponible')
        return
      }

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}))
        setSubmitError((errorBody as { error?: string }).error ?? 'Error al reprogramar el turno')
        return
      }

      // Éxito — invalidar query del día nuevo y del día actual
      queryClient.invalidateQueries({ queryKey: ['agenda', 'day', date] })
      queryClient.invalidateQueries({ queryKey: ['agenda', 'day', values.appointment_date] })

      // Story 13.4 — si el turno pertenece a una serie/paquete, invalidar el tracking
      // de tratamientos para refrescar la sección "Paquetes" de la ficha (§13.5) y el
      // badge "Sesión X/N" del Calendario. Condicional para no invalidar de más en
      // turnos sueltos (package_id == null).
      if (appointment.package_id != null) {
        queryClient.invalidateQueries({ queryKey: ['treatments'] })
      }

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
                  disabled={!availabilityEnabled || isLoadingAvailability || availableTimes.length === 0}
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
                  <option value="">
                    {!availabilityEnabled
                      ? 'Elegí una fecha'
                      : isLoadingAvailability
                        ? 'Cargando horarios disponibles...'
                        : isAvailabilityError
                          ? 'No se pudo cargar la disponibilidad'
                          : availableTimes.length === 0
                            ? 'Sin horarios libres para esta fecha'
                            : 'Seleccioná un horario'}
                  </option>
                  {availableTimes.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
                {isAvailabilityError && (
                  <p role="alert" className="mt-1 text-xs text-red-600">
                    No se pudo cargar la disponibilidad. Probá de nuevo.
                  </p>
                )}
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

              {/* Profesional (Story 13.4 — reasignación opcional de la sesión) */}
              <div>
                <label
                  htmlFor="reschedule-professional"
                  className="block text-sm font-medium text-[var(--color-text-primary)] mb-1"
                >
                  Profesional
                </label>
                <select
                  id="reschedule-professional"
                  {...form.register('professional_id')}
                  className={inputClass(!!form.formState.errors.professional_id)}
                  aria-invalid={!!form.formState.errors.professional_id}
                  aria-describedby={
                    form.formState.errors.professional_id
                      ? 'reschedule-professional-error'
                      : undefined
                  }
                >
                  <option value="">Mantener profesional actual</option>
                  {profesionales.map((p) => (
                    <option key={p.professional_id} value={p.professional_id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {form.formState.errors.professional_id && (
                  <p
                    id="reschedule-professional-error"
                    role="alert"
                    className="mt-1 text-xs text-red-600"
                  >
                    {form.formState.errors.professional_id.message}
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
