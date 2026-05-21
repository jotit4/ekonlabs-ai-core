'use client'

import { format } from 'date-fns'
import { Pencil, Clock } from 'lucide-react'
import {
  type Appointment,
  type AppointmentStatus,
  type CalendarEvent,
  appointmentToCalendarEvent,
} from '@/types/appointments'
import { AgendaDayViewSkeleton } from './AgendaDayView'

function getEventColor(status: AppointmentStatus): string {
  switch (status) {
    case 'confirmed':
      return '#0071e3'
    case 'rescheduled':
      return '#f97316'
    case 'cancelled':
      return '#8e8e93'
    case 'no_show':
      return '#ef4444'
    case 'pending':
    case 'pending_calendar':
    default:
      return '#8b5cf6'
  }
}

// ─── Vista Día: lista vertical de turnos ─────────────────────────────────────
// El time-grid de react-big-calendar es ilegible cuando hay múltiples
// profesionales con solapamiento. Esta lista ordena los turnos
// cronológicamente y muestra toda la información en un card legible.

function DayListView({
  events,
  onReschedule,
}: {
  events: CalendarEvent[]
  onReschedule?: (appointment: Appointment) => void
}) {
  const sorted = [...events].sort((a, b) => a.start.getTime() - b.start.getTime())

  if (sorted.length === 0) {
    return (
      <div
        style={{
          padding: '64px 0',
          textAlign: 'center',
          color: 'var(--color-text-secondary)',
          fontSize: 14,
        }}
      >
        Sin turnos para este día
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0' }}>
      {sorted.map((event) => {
        const color = getEventColor(event.resource.status)
        const isPendingSync = event.resource.calendar_event_id === null
        const profName =
          event.resource.professionals?.name ??
          event.resource.services?.professional_name ??
          null
        const serviceName = event.resource.services?.name ?? null
        const patientName = event.resource.patients?.full_name ?? 'Paciente'

        return (
          <div
            key={event.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '12px 16px',
              backgroundColor: `${color}12`,
              borderLeft: `4px solid ${color}`,
              borderRadius: '0 8px 8px 0',
            }}
          >
            {/* Horario */}
            <div style={{ minWidth: 88, flexShrink: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color,
                  lineHeight: 1.3,
                }}
              >
                {format(event.start, 'HH:mm')}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--color-text-secondary)',
                  lineHeight: 1.3,
                }}
              >
                {format(event.end, 'HH:mm')}
              </div>
            </div>

            {/* Paciente + servicio + profesional */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  lineHeight: 1.4,
                }}
              >
                {patientName}
              </div>
              {(serviceName ?? profName) && (
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--color-text-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginTop: 2,
                    lineHeight: 1.3,
                  }}
                >
                  {[serviceName, profName].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>

            {/* Acciones */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              {isPendingSync && (
                <Clock
                  style={{ width: 16, height: 16, opacity: 0.45, color: 'var(--color-text-secondary)' }}
                  aria-label="Pendiente de sincronización con Google Calendar"
                />
              )}
              {onReschedule && (
                <button
                  type="button"
                  onClick={() => onReschedule(event.resource)}
                  style={{
                    width: 32,
                    height: 32,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 6,
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-text-secondary)',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(0,0,0,0.06)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'none'
                  }}
                  aria-label={`Reprogramar turno de ${patientName}`}
                  title="Reprogramar"
                >
                  <Pencil style={{ width: 15, height: 15 }} />
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
interface CalendarViewProps {
  date: string
  appointments: Appointment[]
  isLoading: boolean
  isError: boolean
  onRefetch: () => void
  onReschedule?: (appointment: Appointment) => void
}

export function CalendarView({
  appointments,
  isLoading,
  isError,
  onRefetch,
  onReschedule,
}: CalendarViewProps) {
  if (isLoading) {
    return <AgendaDayViewSkeleton />
  }

  if (isError) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 py-12 text-[var(--color-text-secondary)]"
      >
        <p className="text-sm">Error al cargar los turnos</p>
        <button
          onClick={() => onRefetch()}
          className="min-h-[44px] px-4 text-sm text-[var(--color-interactive)] hover:underline"
        >
          Reintentar
        </button>
      </div>
    )
  }

  const events: CalendarEvent[] = appointments
    .filter((apt) => apt && apt.start_at && apt.end_at)
    .map(appointmentToCalendarEvent)

  return <DayListView events={events} onReschedule={onReschedule} />
}
