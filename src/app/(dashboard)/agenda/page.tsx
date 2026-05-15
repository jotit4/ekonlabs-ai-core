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
import { RescheduleTurnoModal } from '@/components/agenda/RescheduleTurnoModal'
import { AgendaFilters } from '@/components/agenda/AgendaFilters'
import { SyncStatusBanner } from '@/components/agenda/SyncStatusBanner'
import { GCalDegradationBanner } from '@/components/agenda/GCalDegradationBanner'
import { useAgendaRealtime } from '@/hooks/use-agenda-realtime'
import { useAppointments } from '@/hooks/use-appointments'
import { useAppointmentsRange } from '@/hooks/use-appointments-range'
import { useGCalChannelStatus } from '@/hooks/use-gcal-channel-status'
import { useTenantConfig } from '@/hooks/use-tenant-config'
import { useUserRole } from '@/hooks/use-user-role'
import type { Appointment } from '@/types/appointments'

function parseValidDate(str: string | null): Date {
  if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date()
  const parsed = parseISO(str)
  return isValid(parsed) ? parsed : new Date()
}

export default function AgendaPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const role = useUserRole()

  const selectedDate = parseValidDate(searchParams.get('fecha'))
  const isoDate = formatISO(selectedDate, { representation: 'date' })

  const professionalId = searchParams.get('professional_id') ?? null
  const serviceId = searchParams.get('service_id') ?? null

  // Determinar vista activa desde query param
  const vistaParam = searchParams.get('vista')
  const vistaActiva: CalendarViewType =
    vistaParam === 'semana' ? 'semana'
    : vistaParam === 'mes' ? 'mes'
    : 'dia'

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

  // Handler para cambiar vista
  function handleVistaChange(vista: CalendarViewType) {
    const params = new URLSearchParams(searchParams.toString())
    if (vista === 'dia') {
      params.delete('vista')
    } else {
      params.set('vista', vista)
    }
    router.push(`/agenda?${params.toString()}`)
  }

  const [showNewTurnoModal, setShowNewTurnoModal] = useState(false)
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

  const showFilters = role === 'admin'

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
            {vistaActiva === 'dia' && (
              <button
                onClick={() => setShowNewTurnoModal(true)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[var(--radius-sm)] px-4 text-sm text-white bg-[var(--color-interactive)] hover:opacity-90 transition-opacity"
                aria-label="Nuevo turno"
              >
                + Nuevo turno
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
        onClose={() => setShowNewTurnoModal(false)}
        date={isoDate}
      />
      <RescheduleTurnoModal
        open={showRescheduleTurnoModal}
        onClose={handleCloseReschedule}
        appointment={selectedAppointmentForReschedule}
        date={isoDate}
      />
    </section>
  )
}
