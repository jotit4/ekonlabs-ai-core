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
import { useAvailability } from '@/hooks/use-availability'
import { MultiSessionScheduler } from '@/components/agenda/MultiSessionScheduler'
import { type SelectedSlot } from '@/components/agenda/AvailabilitySlotPicker'

// Opciones del selector de cantidad: turno suelto o serie/bono de sesiones (x5/x10).
const SESSION_OPTIONS = [1, 5, 10] as const

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
  booking_mode?: 'appointment' | 'walk_in' | 'gated' | 'cycle'
}

interface ProfessionalOption {
  professional_id: string
  name: string
}

// Formato de DNI argentino aceptado: 7 u 8 dígitos. Se usa tanto para disparar
// la autobúsqueda como para precargar el alta inline.
const DNI_REGEX = /^\d{7,8}$/

// P0.1 — valor centinela del selector de profesional para "Cualquier profesional
// disponible". No es un UUID: al guardar se resuelve al profesional del hueco
// elegido. Un UUID nunca contiene '_', así que es inconfundible.
const ANY_PROFESSIONAL = '__any__'

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
  // P0.1 — typeahead: última query ya buscada. Evita re-disparar la misma
  // búsqueda desde el debounce tras un disparo manual/automático; al ser estado,
  // su cambio limpia el timer pendiente (cleanup del effect) sin doble fetch.
  const [lastSearchedQuery, setLastSearchedQuery] = useState('')

  // Inline patient creation state
  const [showCreatePatient, setShowCreatePatient] = useState(false)
  const [isCreatingPatient, setIsCreatingPatient] = useState(false)
  const [createPatientError, setCreatePatientError] = useState<string | null>(null)

  // Slot conflict error
  const [slotConflictError, setSlotConflictError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Modo "serie de sesiones" (bono x5/x10). sessionCount = 1 → turno suelto (flujo
  // clásico, sin cambios). 5/10 → crea un bono (treatment) y agenda las N sesiones
  // que la recepcionista elige A MANO con el mismo motor que Paquetes. Nada
  // automático (reclamo ISADI: los pacientes faltan, se decide turno por turno).
  const [sessionCount, setSessionCount] = useState<number>(1)
  const [multiSlots, setMultiSlots] = useState<SelectedSlot[]>([])
  const [isSubmittingPackage, setIsSubmittingPackage] = useState(false)
  // Si el bono se creó pero el agendado falló por conflicto, reusar ese bono en el
  // reintento en vez de crear uno nuevo (evita bonos huérfanos duplicados). Se
  // resetea al cambiar cualquier dato del bono (paciente/servicio/profesional/cantidad).
  const [createdTreatmentId, setCreatedTreatmentId] = useState<string | null>(null)
  const isPackageMode = sessionCount > 1

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

  // Services list — P0.2: solo servicios agendables por turno (booking_mode
  // 'appointment'). Los modos cycle/gated/walk_in NO generan huecos en este flujo
  // (se gestionan por su propio circuito), así que elegirlos sería un callejón
  // silencioso ("Sin horarios libres" sin explicación).
  const { result: servicesResult } = useList<ServiceOption>({
    resource: 'services',
    filters: [
      { field: 'active', operator: 'eq', value: true },
      { field: 'booking_mode', operator: 'eq', value: 'appointment' },
    ],
    pagination: { mode: 'off' },
    queryOptions: {
      enabled: open,
    },
  })
  // Defensa adicional en cliente por si el provider ignorara el filtro: solo se
  // listan los servicios que traen booking_mode 'appointment' (o sin el campo,
  // para no romper datos legacy/tests que no lo incluyen).
  const services = ((servicesResult?.data ?? []) as ServiceOption[]).filter(
    (s) => s.booking_mode === undefined || s.booking_mode === 'appointment',
  )

  // Watch selección de servicio / profesional / fecha para calcular la
  // disponibilidad REAL (no horarios inventados). El horario solo se elige
  // sobre los huecos libres del servicio+profesional para la fecha elegida.
  const selectedServiceId = useWatch({ control: appointmentForm.control, name: 'service_id' })
  const selectedProfessionalId = useWatch({ control: appointmentForm.control, name: 'professional_id' })
  const selectedDate = useWatch({ control: appointmentForm.control, name: 'appointment_date' })
  const selectedService = services.find((s) => s.service_id === selectedServiceId)
  const durationMinutes = selectedService?.duration_minutes ?? 60

  // P0.1 — "Cualquier profesional disponible": cuando está elegido el centinela,
  // la disponibilidad se pide para TODOS los profesionales del servicio y cada
  // hueco conserva su profesional. El profesional concreto se fija al guardar.
  const isAnyProfessional = selectedProfessionalId === ANY_PROFESSIONAL

  // Hueco elegido en modo "cualquier profesional": clave compuesta
  // `${professional_id}__${HH:MM}` (un UUID no contiene '_', el separador es
  // inconfundible). En modo profesional concreto no se usa.
  const [anySlotKey, setAnySlotKey] = useState<string>('')

  // Disponibilidad real (RPC check_clinic_availability vía /api/availability).
  // Solo se consulta cuando hay servicio + profesional (o "cualquiera") + fecha;
  // si falta alguno, no se muestran horarios inventados.
  const availabilityEnabled =
    !!selectedServiceId && !!selectedProfessionalId && !!selectedDate
  const {
    shiftsForDate,
    isLoading: isLoadingAvailability,
    isError: isAvailabilityError,
  } = useAvailability({
    dateFrom: selectedDate || '',
    dateTo: selectedDate || '',
    serviceId: selectedServiceId || null,
    professionalId: isAnyProfessional ? null : selectedProfessionalId || null,
    allProfessionals: isAnyProfessional,
    enabled: availabilityEnabled,
  })

  // Huecos libres para la fecha elegida. La RPC ya considera el horario del
  // profesional y los turnos ocupados. En modo "cualquiera" trae los de todos
  // los profesionales del servicio (uno por hueco real, no colapsado por hora).
  const availableShifts = availabilityEnabled ? shiftsForDate(selectedDate) : []
  const availableTimes = availableShifts.map((shift) => shift.open)

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
      setAnySlotKey('')
      setCreatedTreatmentId(null)

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
      // Un único profesional → se preselecciona (no tiene sentido "cualquiera").
      appointmentForm.setValue('professional_id', professionals[0].professional_id)
    } else if (professionals.length >= 2) {
      // P0.1 — varios profesionales: por defecto "Cualquier profesional
      // disponible" para que la recepcionista pida el primer hueco libre con
      // cualquiera. En modo serie (bono) el profesional debe ser concreto → ''.
      appointmentForm.setValue('professional_id', isPackageMode ? '' : ANY_PROFESSIONAL)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [professionals])

  // Focus DNI input when modal opens
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

  // Limpiar la hora elegida si dejó de estar disponible (cambió servicio /
  // profesional / fecha, o el hueco se ocupó). Solo cuando ya hay datos de
  // disponibilidad cargados, para no borrar el prefill (Story 10.7) antes de
  // resolver la consulta. Si el horario prellenado sigue libre, se conserva.
  const selectedTime = useWatch({ control: appointmentForm.control, name: 'appointment_time_hhmm' })
  useEffect(() => {
    if (!availabilityEnabled || isLoadingAvailability || isAvailabilityError) return
    if (selectedTime && !availableTimes.includes(selectedTime)) {
      appointmentForm.setValue('appointment_time_hhmm', '')
    }
    // appointmentForm es estable; availableTimes deriva de los watches de arriba
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availabilityEnabled, isLoadingAvailability, isAvailabilityError, selectedTime, availableTimes.join(',')])

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
    setAnySlotKey('')
    setLastSearchedQuery('')
    setSessionCount(1)
    setMultiSlots([])
    setIsSubmittingPackage(false)
    setCreatedTreatmentId(null)
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

  // Limpiar el paciente seleccionado para identificar a otro (botón "Cambiar").
  // Deja intactos los datos del turno ya elegidos (servicio/fecha/hora) para no
  // obligar a recargarlos: solo se corrige a quién se le da el turno.
  const handleResetPatient = () => {
    setPatient(null)
    setPatientResults(null)
    setPatientSearchError(null)
    setShowCreatePatient(false)
    setCreatePatientError(null)
    setLastSearchedQuery('')
    setCreatedTreatmentId(null)
    appointmentForm.setValue('patient_id', '')
    searchForm.reset({ query: '' })
    createPatientForm.reset()
    setTimeout(() => searchInputRef.current?.focus(), 50)
  }

  // Lógica de búsqueda compartida por el disparo manual (Enter) y la autobúsqueda
  // por DNI. `query` ya viene validada (mín. 2 chars; la autobúsqueda exige DNI).
  const performSearch = async (rawQuery: string) => {
    const query = rawQuery.trim()
    setLastSearchedQuery(query)
    setIsSearching(true)
    setPatientSearchError(null)
    setPatient(null)
    setPatientResults(null)
    setShowCreatePatient(false)
    setCreatePatientError(null)

    try {
      const res = await fetch(
        `/api/patients/search?q=${encodeURIComponent(query)}`,
      )
      const body = await res.json() as { patients?: PatientResult[]; error?: string }

      if (!res.ok) {
        setPatientSearchError(body.error ?? 'Error al buscar pacientes. Intentá de nuevo.')
        return
      }

      const results = body.patients ?? []

      if (results.length === 0) {
        const isDni = DNI_REGEX.test(query)
        setPatientSearchError(
          isDni
            ? `No hay ningún paciente con DNI ${query}. Cargá sus datos para darle el turno.`
            : `Sin resultados para '${query}'. Cargá los datos del paciente.`,
        )
        setShowCreatePatient(true)
        // Precargar el campo correspondiente según el formato de la query, para
        // que la recepcionista no re-tipee lo que ya escribió.
        if (isDni) {
          createPatientForm.setValue('dni', query)
        } else if (/^\+?\d[\d\s\-]{6,}$/.test(query)) {
          createPatientForm.setValue('phone_number', query)
        }
        return
      }

      if (results.length === 1) {
        // Auto-seleccionar si hay exactamente 1 resultado (el DNI es único por
        // tenant, así que la búsqueda por DNI siempre cae acá cuando existe).
        const found = results[0]
        if (found.deletion_requested_at) {
          setPatientSearchError('Este paciente tiene una eliminación programada')
          return
        }
        setPatient(found)
        appointmentForm.setValue('patient_id', found.patient_id)
        return
      }

      // Múltiples resultados — mostrar lista para que elija (fallback: sólo
      // ocurre si se busca por nombre/teléfono vía Enter, no con DNI exacto).
      setPatientResults(results)
    } catch {
      setPatientSearchError('Error de red al buscar el paciente.')
    } finally {
      setIsSearching(false)
    }
  }

  // Disparo manual (Enter) — fallback explícito de la autobúsqueda.
  const handleSearchPatient = async (values: PatientSearchValues) => {
    await performSearch(values.query)
  }

  // Autobúsqueda por DNI: en cuanto el campo contiene un DNI válido (7-8 dígitos)
  // busca solo con un pequeño debounce, sin obligar a apretar ningún botón. El
  // ref evita re-buscar lo ya buscado (p. ej. tras un disparo manual).
  const watchedQuery = useWatch({ control: searchForm.control, name: 'query' })
  useEffect(() => {
    const q = (watchedQuery ?? '').trim()
    // Solo autodispara con DNI completo; mientras se tipea no busca.
    if (!DNI_REGEX.test(q)) return
    if (q === lastSearchedQuery) return
    const timer = setTimeout(() => {
      void performSearch(q)
    }, 300)
    return () => clearTimeout(timer)
    // performSearch es estable en la práctica (usa setState/forms estables);
    // depende del valor tipeado y de la última query buscada (para dedup).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedQuery, lastSearchedQuery])

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

    // P0.1 — en modo "cualquier profesional" el professional_id del form es el
    // centinela; el profesional real es el del hueco elegido (anySlotKey).
    let professionalId = values.professional_id
    let timeHHmm = values.appointment_time_hhmm
    if (values.professional_id === ANY_PROFESSIONAL) {
      if (!anySlotKey) {
        setSlotConflictError('Elegí un horario disponible')
        return
      }
      const [profId, hhmm] = anySlotKey.split('__')
      if (!profId || !hhmm) {
        setSlotConflictError('Elegí un horario disponible')
        return
      }
      professionalId = profId
      timeHHmm = hhmm
    }

    const appointmentTimeISO = `${values.appointment_date}T${timeHHmm}:00-03:00`

    try {
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: values.patient_id,
          service_id: values.service_id,
          professional_id: professionalId,
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

  // Cambio de cantidad de sesiones (1 / 5 / 10). Al entrar/salir del modo serie
  // se descartan los huecos elegidos y el bono a medio crear; si el profesional
  // estaba en "cualquiera", se fuerza a elegir uno concreto (un bono = un profesional).
  const handleSessionCountChange = (n: number) => {
    setSessionCount(n)
    setMultiSlots([])
    setSubmitError(null)
    setSlotConflictError(null)
    setCreatedTreatmentId(null)
    if (n > 1 && appointmentForm.getValues('professional_id') === ANY_PROFESSIONAL) {
      appointmentForm.setValue('professional_id', '')
    }
  }

  // Reservar una SERIE (bono x5/x10): crea el treatment y agenda las N sesiones
  // elegidas a mano, reusando el endpoint de lote de Paquetes. El bono se crea una
  // sola vez (ref) para que un reintento tras conflicto no duplique bonos.
  const handleSubmitPackage = async () => {
    setSubmitError(null)
    setSlotConflictError(null)

    if (!patient) return
    const values = appointmentForm.getValues()
    const serviceId = values.service_id
    const professionalId = values.professional_id

    if (!serviceId) {
      setSubmitError('Elegí un servicio')
      return
    }
    if (!professionalId || professionalId === ANY_PROFESSIONAL) {
      setSubmitError('Elegí un profesional para la serie de sesiones')
      return
    }
    if (multiSlots.length !== sessionCount) {
      setSubmitError(`Elegí las ${sessionCount} sesiones (llevás ${multiSlots.length})`)
      return
    }

    setIsSubmittingPackage(true)
    try {
      // 1. Crear el bono (una sola vez; si ya existe de un intento previo, reusar).
      let treatmentId = createdTreatmentId
      if (!treatmentId) {
        const tRes = await fetch('/api/treatments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patient_id: patient.patient_id,
            service_id: serviceId,
            professional_id: professionalId,
            total_sessions: sessionCount,
          }),
        })
        if (!tRes.ok) {
          const body = await tRes.json().catch(() => ({}))
          setSubmitError((body as { error?: string }).error ?? 'No se pudo crear el paquete')
          return
        }
        const tBody = (await tRes.json()) as { treatment_id?: string }
        if (!tBody.treatment_id) {
          setSubmitError('No se pudo crear el paquete')
          return
        }
        treatmentId = tBody.treatment_id
        setCreatedTreatmentId(treatmentId)
      }

      // 2. Agendar las N sesiones elegidas (mismo endpoint de lote que Paquetes).
      const sRes = await fetch(`/api/treatments/${encodeURIComponent(treatmentId)}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slots: multiSlots.map((s) => ({ start_at: s.start_at, end_at: s.end_at })),
        }),
      })

      if (sRes.status === 409) {
        // Alguno/todos los horarios se ocuparon. El bono queda creado (se reusa en
        // el reintento); refrescar disponibilidad y que la recepcionista reelija.
        queryClient.invalidateQueries({ queryKey: ['availability'], exact: false })
        queryClient.invalidateQueries({ queryKey: ['agenda'], exact: false })
        setSlotConflictError('Algunos horarios ya no están disponibles. Revisá y elegí de nuevo.')
        setMultiSlots([])
        return
      }

      if (!sRes.ok) {
        const body = await sRes.json().catch(() => ({}))
        setSubmitError((body as { error?: string }).error ?? 'No se pudieron agendar las sesiones')
        return
      }

      // Éxito: invalidar agenda / disponibilidad / paquetes / ficha del paciente.
      queryClient.invalidateQueries({ queryKey: ['agenda', 'day', date] })
      queryClient.invalidateQueries({ queryKey: ['agenda'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['availability'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['treatments'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['patients', 'one', patient.patient_id] })
      handleClose()
    } catch {
      setSubmitError('Error de red. Verificá tu conexión e intentá de nuevo.')
    } finally {
      setIsSubmittingPackage(false)
    }
  }

  // P0.1 — selección de hueco en modo "cualquier profesional". El <select> de
  // horario lleva la clave compuesta; sincronizamos appointment_time_hhmm para que
  // la validación del form pase (el profesional real se resuelve al guardar).
  const handleAnySlotChange = (key: string) => {
    setAnySlotKey(key)
    setSlotConflictError(null)
    const hhmm = key ? key.split('__')[1] ?? '' : ''
    appointmentForm.setValue('appointment_time_hhmm', hhmm)
  }

  const inputClass = (hasError: boolean) =>
    [
      'w-full px-3 py-2 rounded-[8px] border text-sm',
      'bg-[var(--color-bg)] text-[var(--color-text-primary)]',
      'focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]',
      hasError ? 'border-red-400' : 'border-[var(--color-border)]',
    ].join(' ')

  const sectionLabel =
    'text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]'

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
          <div
            className={[
              'bg-[var(--color-bg)] rounded-[12px] shadow-xl w-full max-h-[90vh] overflow-y-auto',
              isPackageMode ? 'max-w-4xl' : 'max-w-3xl',
            ].join(' ')}
          >
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-[var(--color-border)]">
              <Dialog.Title
                id="new-turno-title"
                className="text-lg font-semibold text-[var(--color-text-primary)]"
              >
                Dar un turno
              </Dialog.Title>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                {isPackageMode
                  ? `Serie de ${sessionCount} sesiones: elegí cada horario a mano.`
                  : 'Completá los datos del paciente y del turno, y guardá.'}
              </p>
            </div>

            {/* Body — dos columnas: Paciente · Turno (se apilan en pantalla chica) */}
            <div className="px-6 py-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* ── Columna izquierda: PACIENTE ──────────────────────────── */}
                <div className="space-y-4">
                  <p className={sectionLabel}>Paciente</p>

                  {/* Búsqueda por DNI (autobúsqueda + Enter como fallback) */}
                  <form
                    onSubmit={searchForm.handleSubmit(handleSearchPatient)}
                    noValidate
                    aria-label="Buscar paciente por DNI"
                  >
                    <label
                      htmlFor="patient-search-input"
                      className="block text-sm font-medium text-[var(--color-text-primary)] mb-1"
                    >
                      DNI del paciente
                    </label>
                    <div className="relative">
                      <input
                        id="patient-search-input"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="Ej: 30123456"
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
                      {isSearching && (
                        <span
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--color-text-secondary)]"
                          aria-live="polite"
                        >
                          Buscando…
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                      Ingresá los 7 u 8 dígitos y lo buscamos solo.
                    </p>
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

                  {/* Tarjeta del paciente seleccionado */}
                  {patient && (
                    <div className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-medium text-[var(--color-text-primary)]">
                            ✓ {patient.full_name}
                          </p>
                          {patient.phone_number && (
                            <p className="text-[var(--color-text-secondary)]">Tel: {patient.phone_number}</p>
                          )}
                          {patient.obra_social && (
                            <p className="text-[var(--color-text-secondary)]">Obra social: {patient.obra_social}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={handleResetPatient}
                          className="shrink-0 text-xs font-medium text-[var(--color-interactive)] hover:underline"
                        >
                          Cambiar
                        </button>
                      </div>
                    </div>
                  )}

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

                        <button
                          type="submit"
                          disabled={isCreatingPatient}
                          className={[
                            'w-full px-4 py-2 rounded-[8px] text-sm font-medium min-h-[44px]',
                            'bg-[var(--color-interactive)] text-white',
                            'hover:opacity-90 transition-opacity',
                            isCreatingPatient ? 'opacity-50 cursor-not-allowed' : '',
                          ].join(' ')}
                        >
                          {isCreatingPatient ? 'Creando...' : 'Crear paciente'}
                        </button>
                      </form>
                    </div>
                  )}

                  {/* Lista de resultados (múltiples — fallback de búsqueda por nombre) */}
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
                </div>

                {/* ── Columna derecha: TURNO ───────────────────────────────── */}
                <div className="space-y-4">
                  <p className={sectionLabel}>Turno</p>
                  <form
                    id="appointment-form"
                    onSubmit={appointmentForm.handleSubmit(handleSubmitAppointment)}
                    noValidate
                    className="space-y-4"
                    aria-label="Datos del turno"
                  >
                    {/* patient_id hidden */}
                    <input type="hidden" {...appointmentForm.register('patient_id')} />

                    {/* Cantidad de sesiones: 1 turno suelto o serie/bono (x5/x10) */}
                    <div>
                      <span className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
                        Sesiones
                      </span>
                      <div className="flex gap-2" role="group" aria-label="Cantidad de sesiones">
                        {SESSION_OPTIONS.map((n) => {
                          const active = sessionCount === n
                          return (
                            <button
                              key={n}
                              type="button"
                              aria-pressed={active}
                              onClick={() => handleSessionCountChange(n)}
                              className={[
                                'flex-1 px-3 py-2 rounded-[8px] border text-sm font-medium min-h-[44px] transition-colors',
                                active
                                  ? 'bg-[var(--color-interactive)] text-white border-[var(--color-interactive)]'
                                  : 'bg-[var(--color-bg)] text-[var(--color-text-primary)] border-[var(--color-border)] hover:bg-[var(--color-surface)]',
                              ].join(' ')}
                            >
                              {n === 1 ? '1 turno' : `${n} sesiones`}
                            </button>
                          )
                        })}
                      </div>
                      {isPackageMode && (
                        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                          Se crea un paquete de {sessionCount} y elegís cada horario a mano.
                        </p>
                      )}
                    </div>

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
                        onChange={(e) => {
                          // setValue actualiza el estado de RHF igual que el onChange
                          // nativo; además reseteamos el hueco compuesto de "cualquiera"
                          // al cambiar de profesional (incl. entrar/salir del modo).
                          appointmentForm.setValue('professional_id', e.target.value, { shouldDirty: true })
                          setAnySlotKey('')
                          setCreatedTreatmentId(null)
                        }}
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
                        {/* P0.1 — con 2+ profesionales, ofrecer "cualquiera". En modo
                            serie NO: un bono va con un profesional concreto. */}
                        {professionals.length >= 2 && !isPackageMode && (
                          <option value={ANY_PROFESSIONAL}>Cualquier profesional disponible</option>
                        )}
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

                    {/* Turno único (1): Fecha + Horario. En modo serie se usa el
                        MultiSessionScheduler (más abajo). */}
                    {!isPackageMode && (
                      <>
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
                        onChange={(e) => {
                          appointmentForm.setValue('appointment_date', e.target.value, { shouldDirty: true })
                          // El hueco compuesto de "cualquiera" pertenece a la fecha
                          // anterior: descartarlo al cambiar de día.
                          setAnySlotKey('')
                        }}
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
                      {isAnyProfessional ? (
                        // Modo "cualquier profesional": cada opción es un hueco real
                        // de un profesional concreto, etiquetado "HH:MM · Profesional".
                        // Controlado por anySlotKey (valor compuesto).
                        <select
                          id="time-select"
                          value={anySlotKey}
                          onChange={(e) => handleAnySlotChange(e.target.value)}
                          disabled={!availabilityEnabled || isLoadingAvailability || availableShifts.length === 0}
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
                          <option value="">
                            {!availabilityEnabled
                              ? 'Elegí servicio, profesional y fecha'
                              : isLoadingAvailability
                                ? 'Cargando horarios disponibles...'
                                : isAvailabilityError
                                  ? 'No se pudo cargar la disponibilidad'
                                  : availableShifts.length === 0
                                    ? 'Sin horarios libres para esta fecha'
                                    : 'Seleccioná un horario'}
                          </option>
                          {availableShifts.map((shift) => (
                            <option
                              key={`${shift.professional_id}__${shift.open}`}
                              value={`${shift.professional_id}__${shift.open}`}
                            >
                              {shift.open} · {shift.professional_name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        // Select CONTROLADO (no register): al eliminar el gate, el
                        // <select> se monta antes de tener opciones. Con value
                        // controlado, el horario prellenado (Story 10.7) se refleja
                        // en cuanto la <option> correspondiente aparece.
                        <select
                          id="time-select"
                          value={selectedTime ?? ''}
                          onChange={(e) =>
                            appointmentForm.setValue('appointment_time_hhmm', e.target.value, {
                              shouldValidate: true,
                            })
                          }
                          disabled={!availabilityEnabled || isLoadingAvailability || availableTimes.length === 0}
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
                          <option value="">
                            {!availabilityEnabled
                              ? 'Elegí servicio, profesional y fecha'
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
                      )}
                      {isAvailabilityError && (
                        <p role="alert" className="mt-1 text-xs text-red-600">
                          No se pudo cargar la disponibilidad. Probá de nuevo.
                        </p>
                      )}
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
                      </>
                    )}

                    {/* Serie de sesiones (bono x5/x10): elegir N huecos a mano */}
                    {isPackageMode && (
                      <div>
                        <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
                          Horarios de las {sessionCount} sesiones
                        </label>
                        {!selectedServiceId ||
                        !selectedProfessionalId ||
                        selectedProfessionalId === ANY_PROFESSIONAL ? (
                          <p className="text-sm text-[var(--color-text-secondary)]">
                            Elegí servicio y profesional para ver la disponibilidad.
                          </p>
                        ) : (
                          <MultiSessionScheduler
                            serviceId={selectedServiceId}
                            professionalId={selectedProfessionalId}
                            total={sessionCount}
                            selected={multiSlots}
                            onChange={(slots) => {
                              setSubmitError(null)
                              setSlotConflictError(null)
                              setMultiSlots(slots)
                            }}
                            minDate={today}
                          />
                        )}
                        {slotConflictError && (
                          <p role="alert" className="mt-2 text-xs text-red-600">
                            {slotConflictError}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Error de red/servidor */}
                    {submitError && (
                      <p role="alert" className="text-xs text-red-600">
                        {submitError}
                      </p>
                    )}
                  </form>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 pt-2 flex items-center justify-end gap-3 border-t border-[var(--color-border)]">
              {!patient && (
                <span className="mr-auto text-xs text-[var(--color-text-secondary)]">
                  Identificá al paciente para {isPackageMode ? 'reservar las sesiones' : 'guardar el turno'}.
                </span>
              )}
              <Dialog.Close
                onClick={handleClose}
                className={[
                  'px-4 py-2 rounded-[8px] text-sm font-medium min-h-[44px]',
                  'text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] transition-colors',
                ].join(' ')}
              >
                Cancelar
              </Dialog.Close>
              {isPackageMode ? (
                <button
                  type="button"
                  onClick={handleSubmitPackage}
                  disabled={!patient || multiSlots.length !== sessionCount || isSubmittingPackage}
                  className={[
                    'px-4 py-2 rounded-[8px] text-sm font-medium min-h-[44px]',
                    'bg-[var(--color-interactive)] text-white',
                    'hover:opacity-90 transition-opacity',
                    !patient || multiSlots.length !== sessionCount || isSubmittingPackage
                      ? 'opacity-50 cursor-not-allowed'
                      : '',
                  ].join(' ')}
                >
                  {isSubmittingPackage ? 'Reservando...' : `Reservar ${sessionCount} sesiones`}
                </button>
              ) : (
                <button
                  type="submit"
                  form="appointment-form"
                  disabled={!patient || appointmentForm.formState.isSubmitting}
                  className={[
                    'px-4 py-2 rounded-[8px] text-sm font-medium min-h-[44px]',
                    'bg-[var(--color-interactive)] text-white',
                    'hover:opacity-90 transition-opacity',
                    !patient || appointmentForm.formState.isSubmitting ? 'opacity-50 cursor-not-allowed' : '',
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
