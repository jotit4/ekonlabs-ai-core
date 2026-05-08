'use client'

import { useState, useRef, useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useQueryClient } from '@tanstack/react-query'
import { useList } from '@refinedev/core'
import { Dialog } from '@base-ui/react/dialog'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  patientSearchSchema,
  newAppointmentSchema,
  type PatientSearchValues,
  type NewAppointmentFormValues,
} from '@/lib/schemas/appointment.schema'

interface PatientResult {
  patient_id: string
  full_name: string
  phone_number: string
  obra_social: string | null
}

interface ServiceOption {
  service_id: string
  name: string
  professional_name: string | null
  duration_minutes: number
}

interface NewTurnoModalProps {
  open: boolean
  onClose: () => void
  date: string // ISO date YYYY-MM-DD
}

function generateTimeSlots(durationMinutes: number): string[] {
  const slots: string[] = []
  const startHour = 8
  const endHour = 20
  let current = startHour * 60

  while (current + durationMinutes <= endHour * 60) {
    const hh = Math.floor(current / 60).toString().padStart(2, '0')
    const mm = (current % 60).toString().padStart(2, '0')
    slots.push(`${hh}:${mm}`)
    current += durationMinutes
  }
  return slots
}

export function NewTurnoModal({ open, onClose, date }: NewTurnoModalProps) {
  const queryClient = useQueryClient()
  const dniInputRef = useRef<HTMLInputElement | null>(null)

  // Patient search state
  const [patient, setPatient] = useState<PatientResult | null>(null)
  const [patientSearchError, setPatientSearchError] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  // Slot conflict error
  const [slotConflictError, setSlotConflictError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // DNI search form
  const searchForm = useForm<PatientSearchValues>({
    resolver: standardSchemaResolver(patientSearchSchema),
    defaultValues: { dni: '' },
  })

  // Appointment form
  const appointmentForm = useForm<NewAppointmentFormValues>({
    resolver: standardSchemaResolver(newAppointmentSchema),
    defaultValues: {
      patient_id: '',
      service_id: '',
      appointment_date: date,
      appointment_time_hhmm: '',
    },
  })

  // Services list
  const { result: servicesResult } = useList<ServiceOption>({
    resource: 'services',
    filters: [{ field: 'active', operator: 'eq', value: true }],
    pagination: { mode: 'off' },
    queryOptions: {
      enabled: open,
    },
  })
  const services = (servicesResult?.data ?? []) as ServiceOption[]

  // Watch selected service to generate time slots
  const selectedServiceId = useWatch({ control: appointmentForm.control, name: 'service_id' })
  const selectedService = services.find((s) => s.service_id === selectedServiceId)
  const durationMinutes = selectedService?.duration_minutes ?? 60
  const timeSlots = generateTimeSlots(durationMinutes)

  // Focus DNI input when modal opens
  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => {
      dniInputRef.current?.focus()
    }, 50)
    return () => clearTimeout(timer)
  }, [open])

  const handleClose = () => {
    // Reset all state before closing
    setPatient(null)
    setPatientSearchError(null)
    setSlotConflictError(null)
    setSubmitError(null)
    searchForm.reset()
    appointmentForm.reset({
      patient_id: '',
      service_id: '',
      appointment_date: date,
      appointment_time_hhmm: '',
    })
    onClose()
  }

  const handleSearchPatient = async (values: PatientSearchValues) => {
    setIsSearching(true)
    setPatientSearchError(null)
    setPatient(null)

    try {
      const supabase = createSupabaseBrowserClient()
      const { data, error } = await supabase
        .from('patients')
        .select('patient_id, full_name, phone_number, obra_social')
        .eq('dni', values.dni)
        .maybeSingle()

      if (error) {
        setPatientSearchError('Error al buscar el paciente. Intentá de nuevo.')
        return
      }

      if (!data) {
        setPatientSearchError(`Sin resultados para '${values.dni}'`)
        return
      }

      setPatient(data as PatientResult)
      appointmentForm.setValue('patient_id', data.patient_id)
    } catch {
      setPatientSearchError('Error de red al buscar el paciente.')
    } finally {
      setIsSearching(false)
    }
  }

  const handleSubmitAppointment = async (values: NewAppointmentFormValues) => {
    setSlotConflictError(null)
    setSubmitError(null)

    const appointmentTimeISO = `${values.appointment_date}T${values.appointment_time_hhmm}:00`

    try {
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: values.patient_id,
          service_id: values.service_id,
          appointment_time: appointmentTimeISO,
          duration_minutes: durationMinutes,
        }),
      })

      if (response.status === 409) {
        queryClient.invalidateQueries({ queryKey: ['agenda', 'day', date] })
        setSlotConflictError('Ese horario ya no está disponible')
        return
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        setSubmitError((body as { error?: string }).error ?? 'Error al crear el turno')
        return
      }

      // Éxito
      queryClient.invalidateQueries({ queryKey: ['agenda', 'day', date] })
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

  const today = new Date().toISOString().slice(0, 10)

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose() }}>
      <Dialog.Portal>
        <Dialog.Backdrop
          className="fixed inset-0 bg-black/50 z-40"
          data-testid="dialog-backdrop"
        />
        <Dialog.Popup
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          aria-modal="true"
          aria-labelledby="new-turno-title"
        >
          <div className="bg-[var(--color-bg)] rounded-[12px] shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-[var(--color-border)]">
              <Dialog.Title
                id="new-turno-title"
                className="text-lg font-semibold text-[var(--color-text-primary)]"
              >
                Nuevo turno
              </Dialog.Title>
            </div>

            {/* Body */}
            <div className="px-6 py-4 space-y-5">
              {/* Paso 1: Búsqueda de paciente */}
              <form
                onSubmit={searchForm.handleSubmit(handleSearchPatient)}
                noValidate
                aria-label="Buscar paciente por DNI"
              >
                <label
                  htmlFor="dni-input"
                  className="block text-sm font-medium text-[var(--color-text-primary)] mb-1"
                >
                  DNI del paciente
                </label>
                <div className="flex gap-2">
                  <input
                    id="dni-input"
                    type="text"
                    inputMode="numeric"
                    placeholder="Ej: 12345678"
                    {...searchForm.register('dni')}
                    ref={(el) => {
                      searchForm.register('dni').ref(el)
                      dniInputRef.current = el
                    }}
                    className={inputClass(!!searchForm.formState.errors.dni)}
                    aria-invalid={!!searchForm.formState.errors.dni}
                    aria-describedby={
                      searchForm.formState.errors.dni
                        ? 'dni-error'
                        : patientSearchError
                          ? 'patient-search-error'
                          : undefined
                    }
                  />
                  <button
                    type="submit"
                    disabled={isSearching}
                    className={[
                      'shrink-0 px-4 rounded-[8px] text-sm font-medium min-h-[44px]',
                      'bg-[var(--color-interactive)] text-white',
                      'hover:opacity-90 transition-opacity',
                      isSearching ? 'opacity-50 cursor-not-allowed' : '',
                    ].join(' ')}
                  >
                    {isSearching ? 'Buscando...' : 'Buscar'}
                  </button>
                </div>
                {searchForm.formState.errors.dni && (
                  <p id="dni-error" role="alert" className="mt-1 text-xs text-red-600">
                    {searchForm.formState.errors.dni.message}
                  </p>
                )}
                {patientSearchError && !searchForm.formState.errors.dni && (
                  <p id="patient-search-error" role="alert" className="mt-1 text-xs text-red-600">
                    {patientSearchError}
                  </p>
                )}
              </form>

              {/* Tarjeta del paciente encontrado */}
              {patient && (
                <div className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm space-y-1">
                  <p className="font-medium text-[var(--color-text-primary)]">{patient.full_name}</p>
                  {patient.phone_number && (
                    <p className="text-[var(--color-text-secondary)]">Tel: {patient.phone_number}</p>
                  )}
                  {patient.obra_social && (
                    <p className="text-[var(--color-text-secondary)]">Obra social: {patient.obra_social}</p>
                  )}
                </div>
              )}

              {/* Paso 2: Datos del turno — solo visible si hay paciente */}
              {patient && (
                <form
                  id="appointment-form"
                  onSubmit={appointmentForm.handleSubmit(handleSubmitAppointment)}
                  noValidate
                  className="space-y-4"
                  aria-label="Datos del turno"
                >
                  {/* patient_id hidden */}
                  <input type="hidden" {...appointmentForm.register('patient_id')} />

                  {/* Servicio */}
                  <div>
                    <label
                      htmlFor="service-select"
                      className="block text-sm font-medium text-[var(--color-text-primary)] mb-1"
                    >
                      Servicio
                    </label>
                    <select
                      id="service-select"
                      {...appointmentForm.register('service_id')}
                      className={inputClass(!!appointmentForm.formState.errors.service_id)}
                      aria-invalid={!!appointmentForm.formState.errors.service_id}
                      aria-describedby={
                        appointmentForm.formState.errors.service_id ? 'service-error' : undefined
                      }
                    >
                      <option value="">Seleccioná un servicio</option>
                      {services.map((svc) => (
                        <option key={svc.service_id} value={svc.service_id}>
                          {svc.name}
                          {svc.professional_name ? ` · ${svc.professional_name}` : ''}
                        </option>
                      ))}
                    </select>
                    {appointmentForm.formState.errors.service_id && (
                      <p id="service-error" role="alert" className="mt-1 text-xs text-red-600">
                        {appointmentForm.formState.errors.service_id.message}
                      </p>
                    )}
                  </div>

                  {/* Fecha */}
                  <div>
                    <label
                      htmlFor="date-input"
                      className="block text-sm font-medium text-[var(--color-text-primary)] mb-1"
                    >
                      Fecha
                    </label>
                    <input
                      id="date-input"
                      type="date"
                      min={today}
                      {...appointmentForm.register('appointment_date')}
                      className={inputClass(!!appointmentForm.formState.errors.appointment_date)}
                      aria-invalid={!!appointmentForm.formState.errors.appointment_date}
                      aria-describedby={
                        appointmentForm.formState.errors.appointment_date ? 'date-error' : undefined
                      }
                    />
                    {appointmentForm.formState.errors.appointment_date && (
                      <p id="date-error" role="alert" className="mt-1 text-xs text-red-600">
                        {appointmentForm.formState.errors.appointment_date.message}
                      </p>
                    )}
                  </div>

                  {/* Horario */}
                  <div>
                    <label
                      htmlFor="time-select"
                      className="block text-sm font-medium text-[var(--color-text-primary)] mb-1"
                    >
                      Horario
                    </label>
                    <select
                      id="time-select"
                      {...appointmentForm.register('appointment_time_hhmm')}
                      className={inputClass(
                        !!appointmentForm.formState.errors.appointment_time_hhmm || !!slotConflictError,
                      )}
                      aria-invalid={
                        !!appointmentForm.formState.errors.appointment_time_hhmm || !!slotConflictError
                      }
                      aria-describedby={
                        slotConflictError
                          ? 'slot-conflict-error'
                          : appointmentForm.formState.errors.appointment_time_hhmm
                            ? 'time-error'
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
                    {appointmentForm.formState.errors.appointment_time_hhmm && !slotConflictError && (
                      <p id="time-error" role="alert" className="mt-1 text-xs text-red-600">
                        {appointmentForm.formState.errors.appointment_time_hhmm.message}
                      </p>
                    )}
                    {slotConflictError && (
                      <p id="slot-conflict-error" role="alert" className="mt-1 text-xs text-red-600">
                        {slotConflictError}
                      </p>
                    )}
                  </div>

                  {/* Error de red/servidor */}
                  {submitError && (
                    <p role="alert" className="text-xs text-red-600">
                      {submitError}
                    </p>
                  )}
                </form>
              )}
            </div>

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
              {patient && (
                <button
                  type="submit"
                  form="appointment-form"
                  disabled={appointmentForm.formState.isSubmitting}
                  className={[
                    'px-4 py-2 rounded-[8px] text-sm font-medium min-h-[44px]',
                    'bg-[var(--color-interactive)] text-white',
                    'hover:opacity-90 transition-opacity',
                    appointmentForm.formState.isSubmitting ? 'opacity-50 cursor-not-allowed' : '',
                  ].join(' ')}
                >
                  {appointmentForm.formState.isSubmitting ? 'Guardando...' : 'Guardar turno'}
                </button>
              )}
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
