'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { SlidersHorizontal } from 'lucide-react'
import {
  formatISO, parseISO, addDays, addMonths,
  isToday, format, isValid,
  startOfMonth, endOfMonth,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarView } from '@/components/agenda/CalendarView'
import { CalendarViewRangeReadOnly } from '@/components/agenda/CalendarViewRangeReadOnly'
import { CalendarViewSelector, type CalendarViewType } from '@/components/agenda/CalendarViewSelector'
import { TurnoDetailModal } from '@/components/agenda/TurnoDetailModal'
import { KPIStrip } from '@/components/agenda/KPIStrip'
import { NewTurnoModal } from '@/components/agenda/NewTurnoModal'
import { NewPaqueteModal } from '@/components/paquetes/NewPaqueteModal'
import { RescheduleTurnoModal } from '@/components/agenda/RescheduleTurnoModal'
import { AgendaFilters, type AvailabilityMode, type AreaFocus } from '@/components/agenda/AgendaFilters'
import { AgendaLegend } from '@/components/agenda/AgendaLegend'
import { isRehabService } from '@/lib/agenda/service-visuals'
import { SyncStatusBanner } from '@/components/agenda/SyncStatusBanner'
import { GCalDegradationBanner } from '@/components/agenda/GCalDegradationBanner'
import { useAgendaRealtime } from '@/hooks/use-agenda-realtime'
import { useAppointments } from '@/hooks/use-appointments'
import { useAppointmentsRange } from '@/hooks/use-appointments-range'
import { useAvailability } from '@/hooks/use-availability'
import { useGCalChannelStatus } from '@/hooks/use-gcal-channel-status'
import { useTenantConfig } from '@/hooks/use-tenant-config'
import { useUserRole } from '@/hooks/use-user-role'
import type { Appointment } from '@/types/appointments'
import type { AvailabilityShift } from '@/types/availability'

function parseValidDate(str: string | null): Date {
  if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date()
  const parsed = parseISO(str)
  return isValid(parsed) ? parsed : new Date()
}

export function AgendaView() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const role = useUserRole()

  const selectedDate = parseValidDate(searchParams.get('fecha'))
  const isoDate = formatISO(selectedDate, { representation: 'date' })

  const professionalId = searchParams.get('professional_id') ?? null
  const serviceId = searchParams.get('service_id') ?? null

  // ── Modo turnero (recepción) vs agenda completa (admin) ─────────────────────
  // La recepcionista se abruma con demasiados controles: su flujo es "abrir y ver
  // todo" (como su turnero de Excel). Para el rol 'receptionist' arrancamos en un
  // modo mínimo — solo título + navegación + "Dar turno" + un botón "Filtrar" que
  // despliega el resto. El admin conserva la agenda completa (todo visible).
  const isReceptionist = role === 'receptionist'

  // Panel "Filtrar" (solo recepción). Estado local, cerrado por defecto. Al
  // abrirlo se revelan los controles secundarios (selector de vista, dropdowns +
  // Limpiar, "Nuevo paquete"). Para admin no aplica: todo está siempre visible.
  const [filtersOpen, setFiltersOpen] = useState(false)
  const secondaryVisible = isReceptionist ? filtersOpen : true

  // Foco de área (rediseño foco rehabilitación). Estado local (no URL) — es una
  // preferencia de vista, no un filtro persistible/compartible. Cuando el usuario
  // elige un servicio puntual (serviceId), ese filtro manda y el foco de área no
  // recorta nada adicional.
  //   - admin  → default 'rehab' (arranca viendo solo servicios de rehabilitación).
  //   - recepción → default 'todos' (modo turnero: ve TODOS los servicios, sin
  //     recortes; odontología, pediatría, etc. deben aparecer).
  const [areaFocus, setAreaFocus] = useState<AreaFocus>('rehab')

  // El rol se resuelve async (getSession). Fijamos el foco por defecto la primera
  // vez que el rol se conoce; después respetamos los toggles manuales del usuario.
  const areaDefaultApplied = useRef(false)
  useEffect(() => {
    if (role && !areaDefaultApplied.current) {
      areaDefaultApplied.current = true
      setAreaFocus(role === 'receptionist' ? 'todos' : 'rehab')
    }
  }, [role])

  // Determinar vista activa desde query param.
  // AC6 (Story 10.7): vista default = Semana. Sin ?vista → 'semana'.
  // ?vista=dia y ?vista=mes son explícitos.
  const vistaParam = searchParams.get('vista')
  const vistaActiva: CalendarViewType =
    vistaParam === 'dia' ? 'dia'
    : vistaParam === 'mes' ? 'mes'
    : 'semana'

  // Calcular rangos para vista semana y mes.
  // Vista Semana: ventana de 7 días DESDE la fecha ancla (por defecto hoy). El
  // día ancla queda como PRIMERA columna; nunca se muestran días previos al
  // ancla (decisión del usuario — turnero hacia adelante).
  const weekStart = isoDate
  const weekEnd = formatISO(addDays(selectedDate, 6), { representation: 'date' })
  const monthStart = formatISO(startOfMonth(selectedDate), { representation: 'date' })
  const monthEnd = formatISO(endOfMonth(selectedDate), { representation: 'date' })

  const rangeFrom = vistaActiva === 'mes' ? monthStart : weekStart
  const rangeTo = vistaActiva === 'mes' ? monthEnd : weekEnd

  useAgendaRealtime(isoDate)

  // Hooks siempre llamados — nunca condicionales
  const { appointments, isLoading, isError, refetch } = useAppointments(isoDate, {
    professionalId,
    serviceId,
  })

  const {
    appointments: rangeAppointments,
    isLoading: rangeLoading,
    isError: rangeError,
    refetch: rangeRefetch,
  } = useAppointmentsRange(rangeFrom, rangeTo, { professionalId, serviceId })

  // ── Disponibilidad (Story 10.7) ─────────────────────────────────────────────
  // Hook SIEMPRE llamado (regla de hooks). Los params se derivan por vista:
  //   - Día: rango = el día (from==to), modo shifts
  //   - Semana: rango de la semana, modo shifts
  //   - Mes: rango del mes, modo summary (liviano)
  const isMonth = vistaActiva === 'mes'
  const availFrom = vistaActiva === 'dia' ? isoDate : rangeFrom
  const availTo = vistaActiva === 'dia' ? isoDate : rangeTo

  const {
    daysShifts,
    daysSummary,
    shiftsForDate,
  } = useAvailability({
    dateFrom: availFrom,
    dateTo: availTo,
    serviceId,
    professionalId,
    summary: isMonth,
  })

  // Modo "Ver disponibilidad de": derivado de los filtros activos.
  // Cuando el modo es "por servicio" se etiqueta cada hueco con su profesional.
  const availabilityMode: AvailabilityMode =
    professionalId ? 'profesional' : serviceId ? 'servicio' : 'ninguno'
  // Mostrar "· {profesional}" cuando NO se filtra por un profesional concreto
  // (la RPC puede traer huecos de varios profesionales).
  const showProfessionalName = availabilityMode !== 'profesional'

  // Huecos libres para la vista Día (la clave es la fecha consultada = isoDate).
  const dayFreeShifts: AvailabilityShift[] = vistaActiva === 'dia' ? shiftsForDate(isoDate) : []
  // Huecos libres indexados por fecha local para la vista Semana.
  const freeShiftsByDate: Record<string, AvailabilityShift[]> = Object.fromEntries(
    Object.entries(daysShifts).map(([iso, day]) => [iso, day.shifts]),
  )

  // Índice inverso shift → fecha local (clave del response). Permite recuperar la
  // fecha local del hueco al agendar desde la semana sin recomputar desde el UTC.
  const shiftDateIndex = new Map<string, string>()
  for (const [iso, shifts] of Object.entries(freeShiftsByDate)) {
    for (const s of shifts) {
      shiftDateIndex.set(`${s.slot_start_iso}|${s.professional_id}`, iso)
    }
  }

  // ── Foco de área: recorte a rehabilitación ─────────────────────────────────
  // Cuando areaFocus='rehab' y NO hay un servicio puntual elegido, recortamos los
  // turnos y huecos a los servicios de rehabilitación (heurística por nombre,
  // centralizada en service-visuals). Si el usuario eligió un service_id puntual,
  // ese filtro ya es más específico y el foco no recorta nada extra.
  const applyRehabFocus = areaFocus === 'rehab' && !serviceId
  const isRehabAppointment = (apt: Appointment): boolean => isRehabService(apt.services?.name)
  const isRehabShift = (shift: AvailabilityShift): boolean => isRehabService(shift.service_name)

  const focusedAppointments = applyRehabFocus
    ? appointments.filter(isRehabAppointment)
    : appointments
  const focusedRangeAppointments = applyRehabFocus
    ? rangeAppointments.filter(isRehabAppointment)
    : rangeAppointments
  const focusedDayFreeShifts = applyRehabFocus
    ? dayFreeShifts.filter(isRehabShift)
    : dayFreeShifts
  const focusedFreeShiftsByDate = applyRehabFocus
    ? Object.fromEntries(
        Object.entries(freeShiftsByDate).map(([iso, shifts]) => [iso, shifts.filter(isRehabShift)]),
      )
    : freeShiftsByDate

  const { usesNativeCalendar, isPending: tenantConfigPending } = useTenantConfig()
  const { status: gcalStatus } = useGCalChannelStatus(!tenantConfigPending && !usesNativeCalendar)

  // Navegación URL
  function buildFechaUrl(fecha: string): string {
    const params = new URLSearchParams(searchParams.toString())
    params.set('fecha', fecha)
    return `/agenda?${params.toString()}`
  }

  // Calcular fechas de navegación según vista
  let prevISO: string
  let nextISO: string

  if (vistaActiva === 'semana') {
    // Semana = ventana de 7 días desde el ancla → navegar de a ±7 días (no de a
    // semana calendario). "Hoy" (abajo) resetea el ancla a hoy.
    prevISO = formatISO(addDays(selectedDate, -7), { representation: 'date' })
    nextISO = formatISO(addDays(selectedDate, 7), { representation: 'date' })
  } else if (vistaActiva === 'mes') {
    prevISO = formatISO(addMonths(selectedDate, -1), { representation: 'date' })
    nextISO = formatISO(addMonths(selectedDate, 1), { representation: 'date' })
  } else {
    prevISO = formatISO(addDays(selectedDate, -1), { representation: 'date' })
    nextISO = formatISO(addDays(selectedDate, 1), { representation: 'date' })
  }

  const hoy = isToday(selectedDate)

  // Título del header según vista — capitaliza solo la primera letra
  function getHeaderTitle(): string {
    let title: string
    if (vistaActiva === 'dia') {
      title = format(selectedDate, "EEEE d 'de' MMMM", { locale: es })
    } else if (vistaActiva === 'semana') {
      // Rango [ancla .. ancla+6] (ej. "1 de jul – 7 de jul 2026").
      const wStart = selectedDate
      const wEnd = addDays(selectedDate, 6)
      title = `${format(wStart, "d 'de' MMM", { locale: es })} – ${format(wEnd, "d 'de' MMM yyyy", { locale: es })}`
    } else {
      title = format(selectedDate, 'MMMM yyyy', { locale: es })
    }
    return title.charAt(0).toUpperCase() + title.slice(1)
  }

  // Handler para cambiar vista.
  // AC6: 'semana' es el estado limpio (sin ?vista). 'dia'/'mes' se setean explícitos.
  function handleVistaChange(vista: CalendarViewType) {
    const params = new URLSearchParams(searchParams.toString())
    if (vista === 'semana') {
      params.delete('vista')
    } else {
      params.set('vista', vista)
    }
    router.push(`/agenda?${params.toString()}`)
  }

  const [showNewTurnoModal, setShowNewTurnoModal] = useState(false)
  // CTA secundario "Nuevo paquete" (Story 13.5) — abre el modal SIN initialPatient.
  const [showNewPaqueteModal, setShowNewPaqueteModal] = useState(false)
  // Prefill del NewTurnoModal al agendar desde un hueco libre (Story 10.7)
  const [newTurnoPrefill, setNewTurnoPrefill] = useState<{
    serviceId: string
    professionalId: string
    date: string
    timeHHmm: string
  } | null>(null)
  const [showRescheduleTurnoModal, setShowRescheduleTurnoModal] = useState(false)
  const [selectedAppointmentForReschedule, setSelectedAppointmentForReschedule] =
    useState<Appointment | null>(null)
  const [selectedAppointmentDetail, setSelectedAppointmentDetail] =
    useState<Appointment | null>(null)

  function handleOpenReschedule(appointment: Appointment) {
    setSelectedAppointmentForReschedule(appointment)
    setShowRescheduleTurnoModal(true)
  }

  function handleCloseReschedule() {
    setShowRescheduleTurnoModal(false)
    setSelectedAppointmentForReschedule(null)
  }

  function handleAppointmentClick(appointment: Appointment) {
    setSelectedAppointmentDetail(appointment)
  }

  function handleRescheduleFromDetail(appointment: Appointment) {
    setSelectedAppointmentDetail(null)
    handleOpenReschedule(appointment)
  }

  // Exclusión mutua (professional_id ⊕ service_id): nunca se mandan los dos a la
  // vez. Antes vivía en el radiogroup "Ver disponibilidad de" (eliminado); ahora
  // se dispara desde el onChange de cada dropdown. Se resuelve en un ÚNICO push
  // (set uno + delete el opuesto) — llamar a los dos handlers por separado
  // provocaría dos navegaciones que se pisan (cada una lee el searchParams viejo).
  function handleProfessionalChange(id: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (id) {
      params.set('professional_id', id)
      params.delete('service_id')
    } else {
      params.delete('professional_id')
    }
    router.push(`/agenda?${params.toString()}`)
  }

  function handleServiceChange(id: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (id) {
      params.set('service_id', id)
      params.delete('professional_id')
    } else {
      params.delete('service_id')
    }
    router.push(`/agenda?${params.toString()}`)
  }

  function handleClearFilters() {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('professional_id')
    params.delete('service_id')
    router.push(`/agenda?${params.toString()}`)
  }

  // Cambiar el foco de área (Rehabilitación ↔ Ver todo). Si había un service_id
  // puntual elegido que ya no pertenece al nuevo foco, lo limpiamos para no
  // mostrar una agenda vacía con un filtro fuera de foco.
  function handleAreaFocusChange(focus: AreaFocus) {
    setAreaFocus(focus)
  }

  // Agendar desde un hueco libre (Story 10.7, AC5).
  // CRÍTICO timezone: NewTurnoModal arma el ISO con `${date}T${hhmm}:00-03:00`.
  // Por eso pasamos shift.open (HH:MM local) y la fecha LOCAL del slot, derivada
  // de la clave `date` del response — NUNCA el slot_start_iso (UTC) crudo.
  function handleFreeSlotClick(shift: AvailabilityShift) {
    const slotDate =
      shiftDateIndex.get(`${shift.slot_start_iso}|${shift.professional_id}`) ?? isoDate
    setNewTurnoPrefill({
      serviceId: shift.service_id,
      professionalId: shift.professional_id,
      date: slotDate,
      timeHHmm: shift.open,
    })
    setShowNewTurnoModal(true)
  }

  // Click en un día de la vista Mes → navegar a vista Semana de esa fecha
  // preservando los demás params.
  function handleDayClick(targetIso: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('fecha', targetIso)
    params.delete('vista') // sin vista = semana
    router.push(`/agenda?${params.toString()}`)
  }

  function handleCloseNewTurno() {
    setShowNewTurnoModal(false)
    setNewTurnoPrefill(null)
  }

  // La recepcionista es la usuaria principal del módulo → tiene acceso a los
  // filtros (aunque en modo turnero arrancan plegados tras "Filtrar").
  const showFilters = role === 'admin' || role === 'receptionist'

  // Botón primario: en recepción se llama "Dar turno" (lenguaje del turnero);
  // para admin se conserva "Nuevo turno".
  const turnoLabel = isReceptionist ? 'Dar turno' : 'Nuevo turno'

  return (
    <section className="w-full h-full flex flex-col px-4 lg:px-6 py-4">
      <header className="flex items-start justify-between mb-6">
        <div>
          <p className="text-sm text-[var(--color-text-secondary)]">Agenda</p>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight">
            {getHeaderTitle()}
          </h1>
        </div>
        <div className="flex items-center gap-3 mt-2 flex-wrap justify-end">
          {/* Selector de vista: en modo turnero (recepción) vive detrás de
              "Filtrar"; para admin siempre visible. */}
          {secondaryVisible && (
            <CalendarViewSelector activeView={vistaActiva} onChange={handleVistaChange} />
          )}
          {/* Botón "Filtrar" — solo recepción. Despliega el selector de vista, los
              dropdowns Profesional/Servicio (+ Limpiar) y "Nuevo paquete". */}
          {isReceptionist && (
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
              aria-controls="agenda-secondary-controls"
              aria-label="Filtrar"
              data-tour="agenda-filtrar-btn"
              className={[
                'min-h-[44px] min-w-[44px] flex items-center gap-2 rounded-[var(--radius-sm)] px-4 text-sm border transition-colors',
                filtersOpen
                  ? 'border-[var(--color-interactive)] text-[var(--color-interactive)] bg-[var(--color-surface)]'
                  : 'border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface)]',
              ].join(' ')}
            >
              <SlidersHorizontal size={16} aria-hidden="true" />
              Filtrar
            </button>
          )}
          <div className="flex items-center gap-2">
            {/* Disponible en todas las vistas (día, semana y mes). Desde Mes el
                turno se crea con la fecha ancla como prefill (newTurnoPrefill=null
                → NewTurnoModal usa date={isoDate}). */}
            <button
              onClick={() => { setNewTurnoPrefill(null); setShowNewTurnoModal(true) }}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[var(--radius-sm)] px-4 text-sm text-white bg-[var(--color-interactive)] hover:opacity-90 transition-opacity"
              aria-label={turnoLabel}
              data-tour="new-appointment-btn"
            >
              + {turnoLabel}
            </button>
            {showFilters && secondaryVisible && (
              <button
                onClick={() => setShowNewPaqueteModal(true)}
                className="min-h-[44px] flex items-center justify-center rounded-[var(--radius-sm)] px-4 text-sm text-[var(--color-interactive)] border border-[var(--color-interactive)] hover:bg-[var(--color-surface)] transition-colors"
                aria-label="Nuevo paquete"
              >
                + Nuevo paquete
              </button>
            )}
            <nav
              className="flex items-center gap-1"
              aria-label="Navegación de fecha"
            >
              <button
                onClick={() => router.push(buildFechaUrl(prevISO))}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[var(--radius-sm)] px-3 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] transition-colors"
                aria-label={vistaActiva === 'dia' ? 'Día anterior' : vistaActiva === 'semana' ? 'Semana anterior' : 'Mes anterior'}
              >
                ← Anterior
              </button>
              {!hoy && (
                <button
                  onClick={() => router.push('/agenda')}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[var(--radius-sm)] px-3 text-sm text-[var(--color-interactive)]"
                  aria-label="Ir a hoy"
                >
                  Hoy
                </button>
              )}
              <button
                onClick={() => router.push(buildFechaUrl(nextISO))}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[var(--radius-sm)] px-3 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] transition-colors"
                aria-label={vistaActiva === 'dia' ? 'Día siguiente' : vistaActiva === 'semana' ? 'Semana siguiente' : 'Mes siguiente'}
              >
                Siguiente →
              </button>
            </nav>
          </div>
        </div>
      </header>

      <div className="mb-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        {/* Contenedor de los filtros. En modo turnero (recepción) se revela con
            "Filtrar" (secondaryVisible); para admin siempre visible. La leyenda de
            ESTADOS queda SIEMPRE a la vista (es informativa, no un control). */}
        {showFilters && (
          <div id="agenda-secondary-controls">
            {secondaryVisible && (
              <AgendaFilters
                professionalId={professionalId}
                serviceId={serviceId}
                onProfessionalChange={handleProfessionalChange}
                onServiceChange={handleServiceChange}
                onClear={handleClearFilters}
                showFilters={showFilters}
                areaFocus={areaFocus}
                onAreaFocusChange={handleAreaFocusChange}
              />
            )}
          </div>
        )}
        <AgendaLegend />
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
      {vistaActiva === 'dia' ? (
        <>
          <KPIStrip appointments={focusedAppointments} isLoading={isLoading} isError={isError} />
          {!tenantConfigPending && !usesNativeCalendar && (
            <>
              <SyncStatusBanner appointments={focusedAppointments} date={isoDate} />
              <GCalDegradationBanner status={gcalStatus} />
            </>
          )}
          <CalendarView
            date={isoDate}
            appointments={focusedAppointments}
            isLoading={isLoading}
            isError={isError}
            onRefetch={refetch}
            onReschedule={handleOpenReschedule}
            freeShifts={focusedDayFreeShifts}
            showProfessionalName={showProfessionalName}
            onFreeSlotClick={handleFreeSlotClick}
            onAppointmentClick={handleAppointmentClick}
          />
          <TurnoDetailModal
            open={selectedAppointmentDetail !== null}
            appointment={selectedAppointmentDetail}
            onClose={() => setSelectedAppointmentDetail(null)}
            onReschedule={handleRescheduleFromDetail}
            date={isoDate}
          />
        </>
      ) : (
        <>
          <CalendarViewRangeReadOnly
            view={vistaActiva === 'semana' ? 'week' : 'month'}
            date={isoDate}
            appointments={focusedRangeAppointments}
            isLoading={rangeLoading}
            isError={rangeError}
            onRefetch={rangeRefetch}
            onAppointmentClick={handleAppointmentClick}
            freeShiftsByDate={vistaActiva === 'semana' ? focusedFreeShiftsByDate : undefined}
            availabilitySummary={isMonth ? daysSummary : undefined}
            showProfessionalName={showProfessionalName}
            onFreeSlotClick={handleFreeSlotClick}
            onDayClick={handleDayClick}
          />
          <TurnoDetailModal
            open={selectedAppointmentDetail !== null}
            appointment={selectedAppointmentDetail}
            onClose={() => setSelectedAppointmentDetail(null)}
            onReschedule={handleRescheduleFromDetail}
            date={isoDate}
          />
        </>
      )}

      </div>

      <NewTurnoModal
        open={showNewTurnoModal}
        onClose={handleCloseNewTurno}
        date={newTurnoPrefill?.date ?? isoDate}
        initialServiceId={newTurnoPrefill?.serviceId}
        initialProfessionalId={newTurnoPrefill?.professionalId}
        initialDate={newTurnoPrefill?.date}
        initialTimeHHmm={newTurnoPrefill?.timeHHmm}
      />
      <RescheduleTurnoModal
        open={showRescheduleTurnoModal}
        onClose={handleCloseReschedule}
        appointment={selectedAppointmentForReschedule}
        date={isoDate}
      />
      {showFilters && (
        <NewPaqueteModal
          open={showNewPaqueteModal}
          onClose={() => setShowNewPaqueteModal(false)}
        />
      )}
    </section>
  )
}
