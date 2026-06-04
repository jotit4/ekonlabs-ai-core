'use client'

import { useState, useRef, useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useQueryClient } from '@tanstack/react-query'
import { useList } from '@refinedev/core'
import { Dialog } from '@base-ui/react/dialog'
import {
  patientSearchSchema,
  newAppointmentSchema,
  type PatientSearchValues,
  type NewAppointmentFormValues,
} from '@/lib/schemas/appointment.schema'
import { PatientFormSchema, type PatientFormValues } from '@/lib/schemas/patient.schema'

interface PatientResult {
  patient_id: string
  full_name: string
  phone_number: string
  obra_social: string | null
  deletion_requested_at: string | null
}

interface ServiceOption {
  service_id: string
  name: string
  professional_name: string | null
  duration_minutes: number
}

interface ProfessionalOption {
  professional_id: string
  name: string
}

interface NewTurnoModalProps {
  open: boolean
  onClose: () => void
  date: string // ISO date YYYY-MM-DD
  // Story 10.7 — prefill al agendar desde un hueco libre (opcional)
  initialServiceId?: string
  initialProfessionalId?: string
  initialDate?: string // YYYY-MM-DD
  initialTimeHHmm?: string // HH:MM
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

export function NewTurnoModal({
  open,
  onClose,
  date,
  initialServiceId,
  initialProfessionalId,
  initialDate,
  initialTimeHHmm,
}: NewTurnoModalProps) {
  const queryClient = useQueryClient()
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  // Patient search state
  const [patient, setPatient] = useState<PatientResult | null>(null)
  const [patientResults, setPatientResults] = useState<PatientResult[] | null>(null)
  const [patientSearchError, setPatientSearchError] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  // Inline patient creation state
  const [showCreatePatient, setShowCreatePatient] = useState(false)
  const [isCreatingPatient, setIsCreatingPatient] = useState(false)
  const [createPatientError, setCreatePatientError] = useState<string | null>(null)

  // Slot conflict error
  const [slotConflictError, setSlotConflictError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Profesionales del servicio elegido
  const [professionals, setProfessionals] = useState<ProfessionalOption[]>([])
  const [isLoadingProfessionals, setIsLoadingProfessionals] = useState(false)
  const [professionalsError, setProfessionalsError] = useState<string | null>(null)

  // Story 10.7 — profesional a fijar una vez cargada la lista (prefill desde hueco).
  // Se consume en el effect de carga de profesionales para evitar carreras.
  const pendingProfessionalRef = useRef<string | null>(null)

  // Search form
  const searchForm = useForm<PatientSearchValues>({
    resolver: standardSchemaResolver(patientSearchSchema),
    defaultValues: { query: '' },
  })

  // Inline patient creation form
  const createPatientForm = useForm<PatientFormValues>({
    resolver: standardSchemaResolver(PatientFormSchema),
    defaultValues: { full_name: '', phone_number: '', dni: '', email: '' },
  })

  // Appointment form
  const appointmentForm = useForm<NewAppointmentFormValues>({
    resolver: standardSchemaResolver(newAppointmentSchema),
    defaultValues: {
      patient_id: '',
      service_id: '',
      professional_id: '',
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

  // Cargar profesionales del servicio elegido (modelo de turnos por profesional).
  // El paciente elige el profesional, por eso el selector se filtra por servicio.
  useEffect(() => {
    let cancelled = false

    ;(async () => {
      // Reset del profesional elegido al cambiar de servicio (dentro del async
      // para no disparar cascading renders síncronos — react-hooks/set-state-in-effect)
      appointmentForm.setValue('professional_id', '')
      setProfessionals([])
      setProfessionalsError(null)

      if (!selectedServiceId) return

      setIsLoadingProfessionals(true)
      try {
        const res = await fetch(
          `/api/services/${encodeURIComponent(selectedServiceId)}/profesionales`,
        )
        const body = (await res.json()) as { data?: ProfessionalOption[]; error?: string }
        if (cancelled) return
        if (!res.ok) {
          setProfessionalsError(body.error ?? 'Error al cargar profesionales')
          return
        }
        setProfessionals(body.data ?? [])
      } catch {
        if (!cancelled) setProfessionalsError('Error de red al cargar profesionales')
      } finally {
        if (!cancelled) setIsLoadingProfessionals(false)
      }
    })()

    return () => {
      cancelled = true
    }
    // appointmentForm es estable (react-hook-form); sólo depende del servicio
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedServiceId])

  // Preselección del único profesional disponible — en effect separado para que
  // la opción ya esté renderizada en el <select> antes de setValue (si no, el
  // DOM ignora el valor por no existir aún la <option>).
  useEffect(() => {
    // Prefill (Story 10.7): si hay un profesional pendiente del hueco libre y
    // ya está en la lista cargada, fijarlo. Tiene prioridad sobre la
    // preselección automática del único profesional.
    const pending = pendingProfessionalRef.current
    if (pending && professionals.some((p) => p.professional_id === pending)) {
      appointmentForm.setValue('professional_id', pending)
      pendingProfessionalRef.current = null
      return
    }
    if (professionals.length === 1) {
      appointmentForm.setValue('professional_id', professionals[0].professional_id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [professionals])

  // Focus search input when modal opens
  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => {
      searchInputRef.current?.focus()
    }, 50)
    return () => clearTimeout(timer)
  }, [open])

  // Story 10.7 — prefill al abrir desde un hueco libre. Setear servicio (dispara
  // la carga de profesionales), fecha y hora; el profesional se fija vía
  // pendingProfessionalRef una vez cargada la lista. Solo al transicionar a
  // open=true con prefill (no en cada render).
  useEffect(() => {
    if (!open) return
    if (!initialServiceId && !initialProfessionalId && !initialDate && !initialTimeHHmm) return

    pendingProfessionalRef.current = initialProfessionalId ?? null
    if (initialDate) appointmentForm.setValue('appointment_date', initialDate)
    if (initialTimeHHmm) appointmentForm.setValue('appointment_time_hhmm', initialTimeHHmm)
    if (initialServiceId) appointmentForm.setValue('service_id', initialServiceId)
    // appointmentForm es estable (react-hook-form); deps = solo open + valores de prefill
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialServiceId, initialProfessionalId, initialDate, initialTimeHHmm])

  const handleClose = () => {
    // Reset all state before closing
    setPatient(null)
    setPatientResults(null)
    setPatientSearchError(null)
    setShowCreatePatient(false)
    setIsCreatingPatient(false)
    setCreatePatientError(null)
    setSlotConflictError(null)
    setSubmitError(null)
    setProfessionals([])
    setProfessionalsError(null)
    setIsLoadingProfessionals(false)
    searchForm.reset()
    createPatientForm.reset()
    appointmentForm.reset({
      patient_id: '',
      service_id: '',
      professional_id: '',
      appointment_date: date,
      appointment_time_hhmm: '',
    })
    onClose()
  }

  const handleSearchPatient = async (values: PatientSearchValues) => {
    setIsSearching(true)
    setPatientSearchError(null)
    setPatient(null)
    setPatientResults(null)
    setShowCreatePatient(false)
    setCreatePatientError(null)

    try {
      const res = await fetch(
        `/api/patients/search?q=${encodeURIComponent(values.query)}`,
      )
      const body = await res.json() as { patients?: PatientResult[]; error?: string }

      if (!res.ok) {
        setPatientSearchError(body.error ?? 'Error al buscar pacientes. Intentá de nuevo.')
        return
      }

      const results = body.patients ?? []

      if (results.length === 0) {
        setPatientSearchError(`Sin resultados para '${values.query}'.`)
        setShowCreatePatient(true)
        // Pre-fill phone if query looks like a phone number
        if (/^\+?\d[\d\s\-]{6,}$/.test(values.query.trim())) {
          createPatientForm.setValue('phone_number', values.query.trim())
        }
        return
      }

      if (results.length === 1) {
        // Auto-seleccionar si hay exactamente 1 resultado
        const found = results[0]
        if (found.deletion_requested_at) {
          setPatientSearchError('Este paciente tiene una eliminación programada')
          return
        }
        setPatient(found)
        appointmentForm.setValue('patient_id', found.patient_id)
        return
      }

      // Múltiples resultados — mostrar lista para que elija
      setPatientResults(results)
    } catch {
      setPatientSearchError('Error de red al buscar el paciente.')
    } finally {
      setIsSearching(false)
    }
  }

  const handleSelectPatient = (selected: PatientResult) => {
    if (selected.deletion_requested_at) {
      setPatientSearchError('Este paciente tiene una eliminación programada')
      setPatientResults(null)
      return
    }
    setPatient(selected)
    setPatientResults(null)
    appointmentForm.setValue('patient_id', selected.patient_id)
  }

  const handleCreatePatient = async (values: PatientFormValues) => {
    setIsCreatingPatient(true)
    setCreatePatientError(null)

    try {
      const res = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const body = await res.json() as { patient?: { patient_id: string }; error?: string }

      if (!res.ok) {
        setCreatePatientError(body.error ?? 'Error al crear el paciente.')
        return
      }

      const newPatient: PatientResult = {
        patient_id: body.patient!.patient_id,
        full_name: values.full_name,
        phone_number: values.phone_number,
        obra_social: null,
        deletion_requested_at: null,
      }
      setPatient(newPatient)
      appointmentForm.setValue('patient_id', newPatient.patient_id)
      setShowCreatePatient(false)
      setPatientSearchError(null)
      createPatientForm.reset()
      queryClient.invalidateQueries({ queryKey: ['patients'] })
    } catch {
      setCreatePatientError('Error de red al crear el paciente.')
    } finally {
      setIsCreatingPatient(false)
    }
  }

  const handleSubmitAppointment = async (values: NewAppointmentFormValues) => {
    setSlotConflictError(null)
    setSubmitError(null)

    const appointmentTimeISO = `${values.appointment_date}T${values.appointment_time_hhmm}:00-03:00`

    try {
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: values.patient_id,
          service_id: values.service_id,
          professional_id: values.professional_id,
          appointment_time: appointmentTimeISO,
          duration_minutes: durationMinutes,
        }),
      })

      if (response.status === 409) {
        queryClient.invalidateQueries({ queryKey: ['agenda', 'day', date] })
        queryClient.invalidateQueries({ queryKey: ['availability'], exact: false })
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
      queryClient.invalidateQueries({ queryKey: ['availability'], exact: false })
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

  const today = new Date().toLocaleDateString('en-CA')

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
                aria-label="Buscar paciente"
              >
                <label
                  htmlFor="patient-search-input"
                  className="block text-sm font-medium text-[var(--color-text-primary)] mb-1"
                >
                  Buscar paciente
                </label>
                <div className="flex gap-2">
                  <input
                    id="patient-search-input"
                    type="text"
                    placeholder="DNI, nombre o teléfono..."
                    {...searchForm.register('query')}
                    ref={(el) => {
                      searchForm.register('query').ref(el)
                      searchInputRef.current = el
                    }}
                    className={inputClass(!!searchForm.formState.errors.query)}
                    aria-invalid={!!searchForm.formState.errors.query}
                    aria-describedby={
                      searchForm.formState.errors.query
                        ? 'patient-search-validation-error'
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
                {searchForm.formState.errors.query && (
                  <p id="patient-search-validation-error" role="alert" className="mt-1 text-xs text-red-600">
                    {searchForm.formState.errors.query.message}
                  </p>
                )}
                {patientSearchError && !searchForm.formState.errors.query && (
                  <p id="patient-search-error" role="alert" className="mt-1 text-xs text-red-600">
                    {patientSearchError}
                  </p>
                )}
              </form>

              {/* Formulario inline de creación de paciente */}
              {showCreatePatient && !patient && (
                <div className="rounded-[8px] border border-[var(--color-border)] p-4 space-y-3">
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">Nuevo paciente</p>
                  <form
                    id="create-patient-form"
                    onSubmit={createPatientForm.handleSubmit(handleCreatePatient)}
                    noValidate
                    className="space-y-3"
                    aria-label="Crear nuevo paciente"
                  >
                    <div>
                      <label
                        htmlFor="cp-full-name"
                        className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1"
                      >
                        Nombre completo *
                      </label>
                      <input
                        id="cp-full-name"
                        type="text"
                        {...createPatientForm.register('full_name')}
                        className={inputClass(!!createPatientForm.formState.errors.full_name)}
                        aria-invalid={!!createPatientForm.formState.errors.full_name}
                      />
                      {createPatientForm.formState.errors.full_name && (
                        <p role="alert" className="mt-1 text-xs text-red-600">
                          {createPatientForm.formState.errors.full_name.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="cp-phone"
                        className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1"
                      >
                        Teléfono *
                      </label>
                      <input
                        id="cp-phone"
                        type="tel"
                        {...createPatientForm.register('phone_number')}
                        className={inputClass(!!createPatientForm.formState.errors.phone_number)}
                        aria-invalid={!!createPatientForm.formState.errors.phone_number}
                      />
                      {createPatientForm.formState.errors.phone_number && (
                        <p role="alert" className="mt-1 text-xs text-red-600">
                          {createPatientForm.formState.errors.phone_number.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="cp-dni"
                        className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1"
                      >
                        DNI (opcional)
                      </label>
                      <input
                        id="cp-dni"
                        type="text"
                        inputMode="numeric"
                        {...createPatientForm.register('dni')}
                        className={inputClass(!!createPatientForm.formState.errors.dni)}
                        aria-invalid={!!createPatientForm.formState.errors.dni}
                      />
                      {createPatientForm.formState.errors.dni && (
                        <p role="alert" className="mt-1 text-xs text-red-600">
                          {createPatientForm.formState.errors.dni.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="cp-email"
                        className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1"
                      >
                        Email (opcional)
                      </label>
                      <input
                        id="cp-email"
                        type="email"
                        {...createPatientForm.register('email')}
                        className={inputClass(!!createPatientForm.formState.errors.email)}
                        aria-invalid={!!createPatientForm.formState.errors.email}
                      />
                      {createPatientForm.formState.errors.email && (
                        <p role="alert" className="mt-1 text-xs text-red-600">
                          {createPatientForm.formState.errors.email.message}
                        </p>
                      )}
                    </div>

                    {createPatientError && (
                      <p role="alert" className="text-xs text-red-600">{createPatientError}</p>
                    )}
                  </form>
                </div>
              )}

              {/* Lista de resultados (múltiples) */}
              {patientResults && patientResults.length > 1 && (
                <div
                  role="list"
                  aria-label="Resultados de búsqueda"
                  className="rounded-[8px] border border-[var(--color-border)] divide-y divide-[var(--color-border)] overflow-hidden"
                >
                  {patientResults.map((p) => (
                    <button
                      key={p.patient_id}
                      type="button"
                      role="listitem"
                      onClick={() => handleSelectPatient(p)}
                      className={[
                        'w-full text-left px-4 py-3 text-sm',
                        'bg-[var(--color-bg)] hover:bg-[var(--color-surface)] transition-colors',
                        p.deletion_requested_at ? 'opacity-50 cursor-not-allowed' : '',
                      ].join(' ')}
                      disabled={!!p.deletion_requested_at}
                    >
                      <p className="font-medium text-[var(--color-text-primary)]">{p.full_name}</p>
                      {p.phone_number && (
                        <p className="text-[var(--color-text-secondary)]">Tel: {p.phone_number}</p>
                      )}
                      {p.deletion_requested_at && (
                        <p className="text-red-500 text-xs">Eliminación programada</p>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Tarjeta del paciente seleccionado */}
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

                  {/* Profesional — el paciente elige (modelo por profesional) */}
                  <div>
                    <label
                      htmlFor="professional-select"
                      className="block text-sm font-medium text-[var(--color-text-primary)] mb-1"
                    >
                      Profesional
                    </label>
                    <select
                      id="professional-select"
                      {...appointmentForm.register('professional_id')}
                      disabled={!selectedServiceId || isLoadingProfessionals || professionals.length === 0}
                      className={inputClass(!!appointmentForm.formState.errors.professional_id)}
                      aria-invalid={!!appointmentForm.formState.errors.professional_id}
                      aria-describedby={
                        appointmentForm.formState.errors.professional_id ? 'professional-error' : undefined
                      }
                    >
                      <option value="">
                        {!selectedServiceId
                          ? 'Seleccioná un servicio primero'
                          : isLoadingProfessionals
                            ? 'Cargando profesionales...'
                            : professionals.length === 0
                              ? 'Sin profesionales para este servicio'
                              : 'Seleccioná un profesional'}
                      </option>
                      {professionals.map((prof) => (
                        <option key={prof.professional_id} value={prof.professional_id}>
                          {prof.name}
                        </option>
                      ))}
                    </select>
                    {professionalsError && (
                      <p role="alert" className="mt-1 text-xs text-red-600">
                        {professionalsError}
                      </p>
                    )}
                    {appointmentForm.formState.errors.professional_id && (
                      <p id="professional-error" role="alert" className="mt-1 text-xs text-red-600">
                        {appointmentForm.formState.errors.professional_id.message}
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
              {showCreatePatient && !patient && (
                <button
                  type="submit"
                  form="create-patient-form"
                  disabled={isCreatingPatient}
                  className={[
                    'px-4 py-2 rounded-[8px] text-sm font-medium min-h-[44px]',
                    'bg-[var(--color-interactive)] text-white',
                    'hover:opacity-90 transition-opacity',
                    isCreatingPatient ? 'opacity-50 cursor-not-allowed' : '',
                  ].join(' ')}
                >
                  {isCreatingPatient ? 'Creando...' : 'Crear paciente'}
                </button>
              )}
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
