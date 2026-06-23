'use client'

import { useState, useRef, useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useQueryClient } from '@tanstack/react-query'
import { useList } from '@refinedev/core'
import { Dialog } from '@base-ui/react/dialog'
import {
  patientSearchSchema,
  type PatientSearchValues,
} from '@/lib/schemas/appointment.schema'
import {
  newTreatmentFormSchema,
  type NewTreatmentFormValues,
} from '@/lib/schemas/treatment.schema'

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

interface NewPaqueteModalProps {
  open: boolean
  onClose: () => void
  // Prefill opcional cuando se abre desde la ficha de un paciente
  initialPatient?: PatientResult
}

// Crea SOLO el BONO de N sesiones (paciente + servicio + profesional + total +
// vencimiento opcional). NO genera turnos ni pide patrón semanal: las sesiones se
// agendan después, MANUAL Y FLEXIBLE, desde el tracking del paquete ("Agendar
// sesión"). Reclamo ISADI: el patrón semanal confundía a la clínica.
export function NewPaqueteModal({ open, onClose, initialPatient }: NewPaqueteModalProps) {
  const queryClient = useQueryClient()
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  // Patient search state
  const [patient, setPatient] = useState<PatientResult | null>(initialPatient ?? null)
  const [patientResults, setPatientResults] = useState<PatientResult[] | null>(null)
  const [patientSearchError, setPatientSearchError] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  // Submit state
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  // Profesionales del servicio elegido
  const [professionals, setProfessionals] = useState<ProfessionalOption[]>([])
  const [isLoadingProfessionals, setIsLoadingProfessionals] = useState(false)
  const [professionalsError, setProfessionalsError] = useState<string | null>(null)

  // Search form
  const searchForm = useForm<PatientSearchValues>({
    resolver: standardSchemaResolver(patientSearchSchema),
    defaultValues: { query: '' },
  })

  // Treatment (bono) form — sin patrón semanal ni fecha de inicio.
  const treatmentForm = useForm<NewTreatmentFormValues>({
    resolver: standardSchemaResolver(newTreatmentFormSchema),
    defaultValues: {
      patient_id: initialPatient?.patient_id ?? '',
      service_id: '',
      professional_id: '',
      total_sessions: 1,
      expires_at: '',
    },
  })

  // Services list (solo activos)
  const { result: servicesResult } = useList<ServiceOption>({
    resource: 'services',
    filters: [{ field: 'active', operator: 'eq', value: true }],
    pagination: { mode: 'off' },
    queryOptions: {
      enabled: open,
    },
  })
  const services = (servicesResult?.data ?? []) as ServiceOption[]

  // Servicio elegido → para cargar sus profesionales
  const selectedServiceId = useWatch({ control: treatmentForm.control, name: 'service_id' })

  // Cargar profesionales del servicio elegido (filtrado por servicio en el endpoint).
  useEffect(() => {
    let cancelled = false

    ;(async () => {
      treatmentForm.setValue('professional_id', '')
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
    // treatmentForm es estable (react-hook-form); sólo depende del servicio
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedServiceId])

  // Preselección del único profesional disponible — en effect separado para que
  // la opción ya esté renderizada en el <select> antes de setValue.
  useEffect(() => {
    if (professionals.length === 1) {
      treatmentForm.setValue('professional_id', professionals[0].professional_id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [professionals])

  // Focus search input al abrir (si no hay paciente prefijado)
  useEffect(() => {
    if (!open || patient) return
    const timer = setTimeout(() => {
      searchInputRef.current?.focus()
    }, 50)
    return () => clearTimeout(timer)
  }, [open, patient])

  const handleClose = () => {
    setPatient(initialPatient ?? null)
    setPatientResults(null)
    setPatientSearchError(null)
    setIsSearching(false)
    setSubmitError(null)
    setSubmitSuccess(false)
    setProfessionals([])
    setProfessionalsError(null)
    setIsLoadingProfessionals(false)
    searchForm.reset()
    treatmentForm.reset({
      patient_id: initialPatient?.patient_id ?? '',
      service_id: '',
      professional_id: '',
      total_sessions: 1,
      expires_at: '',
    })
    onClose()
  }

  const handleSearchPatient = async (values: PatientSearchValues) => {
    setIsSearching(true)
    setPatientSearchError(null)
    setPatient(null)
    setPatientResults(null)

    try {
      const res = await fetch(`/api/patients/search?q=${encodeURIComponent(values.query)}`)
      const body = (await res.json()) as { patients?: PatientResult[]; error?: string }

      if (!res.ok) {
        setPatientSearchError(body.error ?? 'Error al buscar pacientes. Intentá de nuevo.')
        return
      }

      const results = body.patients ?? []

      if (results.length === 0) {
        setPatientSearchError(`Sin resultados para '${values.query}'.`)
        return
      }

      if (results.length === 1) {
        const found = results[0]
        if (found.deletion_requested_at) {
          setPatientSearchError('Este paciente tiene una eliminación programada')
          return
        }
        setPatient(found)
        treatmentForm.setValue('patient_id', found.patient_id)
        return
      }

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
    treatmentForm.setValue('patient_id', selected.patient_id)
  }

  const handleSubmitTreatment = async (values: NewTreatmentFormValues) => {
    setSubmitError(null)
    setSubmitSuccess(false)

    // Body del bono: el server setea start_date (= hoy) y pattern vacío.
    const apiBody = {
      patient_id: values.patient_id,
      service_id: values.service_id,
      professional_id: values.professional_id,
      total_sessions: values.total_sessions,
      ...(values.expires_at ? { expires_at: values.expires_at } : {}),
    }

    try {
      const response = await fetch('/api/treatments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiBody),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        setSubmitError((body as { error?: string }).error ?? 'Error al crear el paquete')
        return
      }

      const body = (await response.json()) as { treatment_id?: string }
      if (!body.treatment_id) {
        setSubmitError('Error al crear el paquete')
        return
      }

      setSubmitSuccess(true)
      // El contador deriva de los appointments (0 al crear) — invalidar tracking + ficha.
      queryClient.invalidateQueries({ queryKey: ['treatments'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['patients', 'one', values.patient_id] })
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
  const professionalSelectDisabled =
    !selectedServiceId || isLoadingProfessionals || professionals.length === 0

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose() }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/50 z-40" data-testid="dialog-backdrop" />
        <Dialog.Popup
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          aria-modal="true"
          aria-labelledby="new-paquete-title"
        >
          <div className="bg-[var(--color-bg)] rounded-[12px] shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-[var(--color-border)]">
              <Dialog.Title
                id="new-paquete-title"
                className="text-lg font-semibold text-[var(--color-text-primary)]"
              >
                Nuevo paquete
              </Dialog.Title>
            </div>

            {/* Body */}
            <div className="px-6 py-4 space-y-5">
              {/* Mensaje de éxito */}
              {submitSuccess && (
                <div
                  role="status"
                  className="rounded-[8px] border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800"
                >
                  Paquete creado. Ahora agendá las sesiones desde la ficha del paciente con
                  &quot;Agendar sesión&quot;.
                </div>
              )}

              {/* Paso 1: Búsqueda de paciente (oculto si ya hay paciente prefijado o seleccionado) */}
              {!patient && (
                <form
                  onSubmit={searchForm.handleSubmit(handleSearchPatient)}
                  noValidate
                  aria-label="Buscar paciente"
                >
                  <label
                    htmlFor="paquete-patient-search-input"
                    className="block text-sm font-medium text-[var(--color-text-primary)] mb-1"
                  >
                    Buscar paciente
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="paquete-patient-search-input"
                      type="text"
                      placeholder="DNI, nombre o teléfono..."
                      {...searchForm.register('query')}
                      ref={(el) => {
                        searchForm.register('query').ref(el)
                        searchInputRef.current = el
                      }}
                      className={inputClass(!!searchForm.formState.errors.query)}
                      aria-invalid={!!searchForm.formState.errors.query}
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
                    <p role="alert" className="mt-1 text-xs text-red-600">
                      {searchForm.formState.errors.query.message}
                    </p>
                  )}
                  {patientSearchError && !searchForm.formState.errors.query && (
                    <p role="alert" className="mt-1 text-xs text-red-600">
                      {patientSearchError}
                    </p>
                  )}
                </form>
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

              {/* Paso 2: Datos del bono — solo visible si hay paciente y no se creó aún */}
              {patient && !submitSuccess && (
                <form
                  id="paquete-form"
                  onSubmit={treatmentForm.handleSubmit(handleSubmitTreatment)}
                  noValidate
                  className="space-y-4"
                  aria-label="Datos del paquete"
                >
                  <input type="hidden" {...treatmentForm.register('patient_id')} />

                  {/* Servicio */}
                  <div>
                    <label
                      htmlFor="paquete-service-select"
                      className="block text-sm font-medium text-[var(--color-text-primary)] mb-1"
                    >
                      Servicio
                    </label>
                    <select
                      id="paquete-service-select"
                      {...treatmentForm.register('service_id')}
                      className={inputClass(!!treatmentForm.formState.errors.service_id)}
                      aria-invalid={!!treatmentForm.formState.errors.service_id}
                    >
                      <option value="">Seleccioná un servicio</option>
                      {services.map((svc) => (
                        <option key={svc.service_id} value={svc.service_id}>
                          {svc.name}
                          {svc.professional_name ? ` · ${svc.professional_name}` : ''}
                        </option>
                      ))}
                    </select>
                    {treatmentForm.formState.errors.service_id && (
                      <p role="alert" className="mt-1 text-xs text-red-600">
                        {treatmentForm.formState.errors.service_id.message}
                      </p>
                    )}
                  </div>

                  {/* Profesional (único para todo el paquete) */}
                  <div>
                    <label
                      htmlFor="paquete-professional-select"
                      className="block text-sm font-medium text-[var(--color-text-primary)] mb-1"
                    >
                      Profesional
                    </label>
                    <select
                      id="paquete-professional-select"
                      {...treatmentForm.register('professional_id')}
                      disabled={professionalSelectDisabled}
                      className={inputClass(!!treatmentForm.formState.errors.professional_id)}
                      aria-invalid={!!treatmentForm.formState.errors.professional_id}
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
                    {treatmentForm.formState.errors.professional_id && (
                      <p role="alert" className="mt-1 text-xs text-red-600">
                        {treatmentForm.formState.errors.professional_id.message}
                      </p>
                    )}
                  </div>

                  {/* Total de sesiones */}
                  <div>
                    <label
                      htmlFor="paquete-total-sessions"
                      className="block text-sm font-medium text-[var(--color-text-primary)] mb-1"
                    >
                      Total de sesiones
                    </label>
                    <input
                      id="paquete-total-sessions"
                      type="number"
                      min={1}
                      step={1}
                      {...treatmentForm.register('total_sessions', { valueAsNumber: true })}
                      className={inputClass(!!treatmentForm.formState.errors.total_sessions)}
                      aria-invalid={!!treatmentForm.formState.errors.total_sessions}
                    />
                    {treatmentForm.formState.errors.total_sessions && (
                      <p role="alert" className="mt-1 text-xs text-red-600">
                        {treatmentForm.formState.errors.total_sessions.message}
                      </p>
                    )}
                  </div>

                  {/* Vencimiento (opcional) */}
                  <div>
                    <label
                      htmlFor="paquete-expires-at"
                      className="block text-sm font-medium text-[var(--color-text-primary)] mb-1"
                    >
                      Vencimiento (opcional)
                    </label>
                    <input
                      id="paquete-expires-at"
                      type="date"
                      min={today}
                      {...treatmentForm.register('expires_at')}
                      className={inputClass(!!treatmentForm.formState.errors.expires_at)}
                      aria-invalid={!!treatmentForm.formState.errors.expires_at}
                    />
                    {treatmentForm.formState.errors.expires_at && (
                      <p role="alert" className="mt-1 text-xs text-red-600">
                        {treatmentForm.formState.errors.expires_at.message}
                      </p>
                    )}
                  </div>

                  <p className="text-xs text-[var(--color-text-secondary)]">
                    El paquete se crea sin sesiones agendadas. Después agendás cada sesión eligiendo
                    fecha y horario de la disponibilidad del profesional.
                  </p>

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
                {submitSuccess ? 'Cerrar' : 'Cancelar'}
              </Dialog.Close>
              {patient && !submitSuccess && (
                <button
                  type="submit"
                  form="paquete-form"
                  disabled={treatmentForm.formState.isSubmitting}
                  className={[
                    'px-4 py-2 rounded-[8px] text-sm font-medium min-h-[44px]',
                    'bg-[var(--color-interactive)] text-white',
                    'hover:opacity-90 transition-opacity',
                    treatmentForm.formState.isSubmitting ? 'opacity-50 cursor-not-allowed' : '',
                  ].join(' ')}
                >
                  {treatmentForm.formState.isSubmitting ? 'Guardando...' : 'Crear paquete'}
                </button>
              )}
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
