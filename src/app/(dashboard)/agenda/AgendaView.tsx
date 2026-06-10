'use client'

import { useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  formatISO, parseISO, addDays, addWeeks, addMonths,
  isToday, format, isValid,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
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
import { AgendaFilters, type AvailabilityMode } from '@/components/agenda/AgendaFilters'
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

  // Determinar vista activa desde query param.
  // AC6 (Story 10.7): vista default = Semana. Sin ?vista → 'semana'.
  // ?vista=dia y ?vista=mes son explícitos.
  const vistaParam = searchParams.get('vista')
  const vistaActiva: CalendarViewType =
    vistaParam === 'dia' ? 'dia'
    : vistaParam === 'mes' ? 'mes'
    : 'semana'

  // Calcular rangos para vista semana y mes
  const weekStart = formatISO(startOfWeek(selectedDate, { weekStartsOn: 1 }), { representation: 'date' })
  const weekEnd = formatISO(endOfWeek(selectedDate, { weekStartsOn: 1 }), { representation: 'date' })
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
    prevISO = formatISO(addWeeks(selectedDate, -1), { representation: 'date' })
    nextISO = formatISO(addWeeks(selectedDate, 1), { representation: 'date' })
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
      const wStart = startOfWeek(selectedDate, { weekStartsOn: 1 })
      const wEnd = endOfWeek(selectedDate, { weekStartsOn: 1 })
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

  function handleProfessionalChange(id: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (id) params.set('professional_id', id)
    else params.delete('professional_id')
    router.push(`/agenda?${params.toString()}`)
  }

  function handleServiceChange(id: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (id) params.set('service_id', id)
    else params.delete('service_id')
    router.push(`/agenda?${params.toString()}`)
  }

  function handleClearFilters() {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('professional_id')
    params.delete('service_id')
    router.push(`/agenda?${params.toString()}`)
  }

  // Modo de disponibilidad — exclusión mutua entre professional_id y service_id.
  // El cambio efectivo de filtros lo hace AgendaFilters vía
  // onProfessionalChange/onServiceChange (que ya limpian el opuesto). El modo se
  // deriva de los params en cada render (availabilityMode), así que el callback
  // es un no-op explícito que solo habilita el radiogroup en AgendaFilters.
  function handleAvailabilityModeChange() {
    // No-op intencional — ver comentario arriba.
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

  // La recepcionista es la usuaria principal del módulo → ve los filtros también.
  const showFilters = role === 'admin' || role === 'receptionist'

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="flex items-start justify-between mb-6">
        <div>
          <p className="text-sm text-[var(--color-text-secondary)]">Agenda</p>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight">
            {getHeaderTitle()}
          </h1>
        </div>
        <div className="flex items-center gap-3 mt-2 flex-wrap justify-end">
          <CalendarViewSelector activeView={vistaActiva} onChange={handleVistaChange} />
          <div className="flex items-center gap-2">
            {(vistaActiva === 'dia' || vistaActiva === 'semana') && (
              <button
                onClick={() => { setNewTurnoPrefill(null); setShowNewTurnoModal(true) }}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[var(--radius-sm)] px-4 text-sm text-white bg-[var(--color-interactive)] hover:opacity-90 transition-opacity"
                aria-label="Nuevo turno"
                data-tour="new-appointment-btn"
              >
                + Nuevo turno
              </button>
            )}
            {showFilters && (vistaActiva === 'dia' || vistaActiva === 'semana') && (
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

      {showFilters && (
        <div className="mb-4">
          <AgendaFilters
            professionalId={professionalId}
            serviceId={serviceId}
            onProfessionalChange={handleProfessionalChange}
            onServiceChange={handleServiceChange}
            onClear={handleClearFilters}
            showFilters={showFilters}
            availabilityMode={availabilityMode}
            onAvailabilityModeChange={handleAvailabilityModeChange}
          />
        </div>
      )}

      {vistaActiva === 'dia' ? (
        <>
          <KPIStrip appointments={appointments} isLoading={isLoading} isError={isError} />
          {!tenantConfigPending && !usesNativeCalendar && (
            <>
              <SyncStatusBanner appointments={appointments} date={isoDate} />
              <GCalDegradationBanner status={gcalStatus} />
            </>
          )}
          <CalendarView
            date={isoDate}
            appointments={appointments}
            isLoading={isLoading}
            isError={isError}
            onRefetch={refetch}
            onReschedule={handleOpenReschedule}
            freeShifts={dayFreeShifts}
            showProfessionalName={showProfessionalName}
            onFreeSlotClick={handleFreeSlotClick}
          />
        </>
      ) : (
        <>
          <CalendarViewRangeReadOnly
            view={vistaActiva === 'semana' ? 'week' : 'month'}
            date={isoDate}
            appointments={rangeAppointments}
            isLoading={rangeLoading}
            isError={rangeError}
            onRefetch={rangeRefetch}
            onAppointmentClick={handleAppointmentClick}
            freeShiftsByDate={vistaActiva === 'semana' ? freeShiftsByDate : undefined}
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
          />
        </>
      )}

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
