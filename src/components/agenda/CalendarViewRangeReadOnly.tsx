'use client'

// CSS imports — react-big-calendar base only (month view), no DnD styles
import 'react-big-calendar/lib/css/react-big-calendar.css'

import { useState } from 'react'
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar'
import {
  format,
  parse,
  startOfWeek,
  getDay,
  parseISO,
  addDays,
  isSameDay,
  isToday,
} from 'date-fns'
import { es } from 'date-fns/locale'
import {
  type Appointment,
  type AppointmentStatus,
  type CalendarEvent,
  appointmentToCalendarEvent,
} from '@/types/appointments'
import { AgendaDayViewSkeleton } from './AgendaDayView'

const locales = { es }

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }),
  getDay,
  locales,
})

// Hex codes so they compose cleanly with alpha suffix in JS (e.g. `${color}18`)
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

// ─── Vista Semana custom ──────────────────────────────────────────────────────
// Reemplaza el time-grid de react-big-calendar, que colapsa cuando hay
// múltiples profesionales con turnos en el mismo horario (columnas angostas
// ilegibles). Esta vista muestra 7 columnas, una por día, con eventos
// apilados en orden cronológico y scroll independiente por columna.

function WeekColumnsView({
  weekDate,
  events,
  onEventClick,
}: {
  weekDate: Date
  events: CalendarEvent[]
  onEventClick?: (appointment: Appointment) => void
}) {
  const weekStart = startOfWeek(weekDate, { weekStartsOn: 1 })
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        height: 'calc(100vh - 240px)',
        minHeight: '500px',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    >
      {days.map((day, idx) => {
        const dayEvents = events
          .filter((e) => isSameDay(e.start, day))
          .sort((a, b) => a.start.getTime() - b.start.getTime())
        const isCurrentDay = isToday(day)

        return (
          <div
            key={day.toISOString()}
            style={{
              display: 'flex',
              flexDirection: 'column',
              borderRight: idx < 6 ? '1px solid var(--color-border)' : 'none',
              backgroundColor: isCurrentDay
                ? 'rgba(0,113,227,0.03)'
                : 'var(--color-bg)',
            }}
          >
            {/* Cabecera del día */}
            <div
              style={{
                flexShrink: 0,
                padding: '8px 6px 6px',
                textAlign: 'center',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              <span
                style={{
                  display: 'block',
                  fontSize: 11,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: isCurrentDay ? '#0071e3' : 'var(--color-text-secondary)',
                  marginBottom: 2,
                }}
              >
                {format(day, 'EEE', { locale: es })}
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  fontSize: 15,
                  fontWeight: isCurrentDay ? 700 : 400,
                  color: isCurrentDay ? '#fff' : 'var(--color-text-primary)',
                  backgroundColor: isCurrentDay ? '#0071e3' : 'transparent',
                }}
              >
                {format(day, 'd')}
              </span>
              {dayEvents.length > 0 && (
                <span
                  style={{
                    display: 'block',
                    fontSize: 10,
                    color: 'var(--color-text-secondary)',
                    marginTop: 3,
                  }}
                >
                  {dayEvents.length} {dayEvents.length === 1 ? 'turno' : 'turnos'}
                </span>
              )}
            </div>

            {/* Lista de turnos (scrollable) */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: 4,
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
              }}
            >
              {dayEvents.map((event) => {
                const color = getEventColor(event.resource.status)
                const profName =
                  event.resource.professionals?.name ??
                  event.resource.services?.professional_name ??
                  null

                return (
                  <button
                    key={event.id}
                    onClick={() => onEventClick?.(event.resource)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      background: `${color}18`,
                      border: 'none',
                      borderLeft: `3px solid ${color}`,
                      borderRadius: '0 4px 4px 0',
                      padding: '4px 6px',
                      cursor: 'pointer',
                      flexShrink: 0,
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = `${color}30`
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = `${color}18`
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color,
                        lineHeight: 1.3,
                      }}
                    >
                      {format(event.start, 'HH:mm')}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--color-text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        lineHeight: 1.3,
                      }}
                    >
                      {event.resource.patients?.full_name ?? 'Paciente'}
                    </div>
                    {profName && (
                      <div
                        style={{
                          fontSize: 10,
                          color: 'var(--color-text-secondary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          lineHeight: 1.3,
                        }}
                      >
                        {profName}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Vista Mes: chip adaptivo via container queries ───────────────────────────
// - ancho > 130px: hora + paciente + profesional
// - 70–130px:      hora + paciente
// - < 70px:        solo hora
function RangeEvent({ event }: { event: CalendarEvent }) {
  const professionalName =
    event.resource.professionals?.name ??
    event.resource.services?.professional_name ??
    null
  const hour = format(event.start, 'HH:mm')
  const patientName = event.resource.patients?.full_name ?? 'Paciente'

  return (
    <div className="flex flex-col h-full px-1 py-0.5 cursor-pointer overflow-hidden">
      <span className="rbc-re-header text-[11px] font-semibold leading-tight overflow-hidden whitespace-nowrap text-ellipsis">
        <span className="rbc-re-hour">{hour}</span>
        <span className="rbc-re-sep"> · </span>
        <span className="rbc-re-name">{patientName}</span>
      </span>
      {professionalName && (
        <span className="rbc-re-prof text-[10px] opacity-85 truncate leading-tight mt-px">
          {professionalName}
        </span>
      )}
    </div>
  )
}

// ─── Modal "+N más" (vista Mes) ───────────────────────────────────────────────
interface DayEventsModalProps {
  date: Date
  events: CalendarEvent[]
  onClose: () => void
  onAppointmentClick?: (appointment: Appointment) => void
}

function DayEventsModal({ date, events, onClose, onAppointmentClick }: DayEventsModalProps) {
  const sorted = [...events].sort((a, b) => a.start.getTime() - b.start.getTime())
  const dayLabel = format(date, "EEEE d 'de' MMMM", { locale: es })

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Turnos del ${dayLabel}`}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        style={{
          position: 'relative',
          backgroundColor: 'var(--color-surface, #fff)',
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          width: '100%',
          maxWidth: '400px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px 12px',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <div>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', textTransform: 'capitalize' }}>
              {dayLabel}
            </p>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginTop: 2 }}>
              {sorted.length} {sorted.length === 1 ? 'turno' : 'turnos'}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: 'none',
              background: 'var(--color-bg-subtle, #f5f5f7)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              color: 'var(--color-text-secondary)',
            }}
          >
            ×
          </button>
        </div>

        <ul style={{ overflowY: 'auto', padding: '8px 0', margin: 0, listStyle: 'none' }} role="list">
          {sorted.map((ev) => {
            const color = getEventColor(ev.resource.status)
            const profName =
              ev.resource.professionals?.name ??
              ev.resource.services?.professional_name ??
              null
            const serviceName = ev.resource.services?.name ?? null
            const hour = format(ev.start, 'HH:mm')
            const endHour = format(ev.end, 'HH:mm')

            return (
              <li key={ev.id}>
                <button
                  onClick={() => {
                    onAppointmentClick?.(ev.resource)
                    onClose()
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    padding: '10px 20px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--color-bg-subtle, #f5f5f7)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 4,
                      minWidth: 4,
                      height: 36,
                      borderRadius: 2,
                      backgroundColor: color,
                      marginTop: 2,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>
                      {hour}–{endHour}
                    </p>
                    <p style={{ fontSize: 13, color: 'var(--color-text-primary)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ev.resource.patients?.full_name ?? 'Paciente'}
                    </p>
                    {(serviceName ?? profName) && (
                      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {[serviceName, profName].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
interface CalendarViewRangeReadOnlyProps {
  view: 'week' | 'month'
  date: string // ISO date — fecha de referencia
  appointments: Appointment[]
  isLoading: boolean
  isError: boolean
  onRefetch: () => void
  onAppointmentClick?: (appointment: Appointment) => void
}

export function CalendarViewRangeReadOnly({
  view,
  date,
  appointments,
  isLoading,
  isError,
  onRefetch,
  onAppointmentClick,
}: CalendarViewRangeReadOnlyProps) {
  const [dayPopup, setDayPopup] = useState<{ date: Date; events: CalendarEvent[] } | null>(null)

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

  // Vista Semana: componente custom (sin time-grid de RBC)
  if (view === 'week') {
    return (
      <WeekColumnsView
        weekDate={parseISO(date)}
        events={events}
        onEventClick={onAppointmentClick}
      />
    )
  }

  // Vista Mes: react-big-calendar con chips adaptativos
  return (
    <>
      <div className="rbc-wrapper">
        <Calendar
          localizer={localizer}
          events={events}
          view={Views.MONTH}
          onView={() => {}}
          views={[Views.MONTH]}
          date={parseISO(date)}
          onNavigate={() => {}}
          toolbar={false}
          onSelectEvent={(event: CalendarEvent) => {
            onAppointmentClick?.(event.resource)
          }}
          onShowMore={(shownEvents: CalendarEvent[], date: Date) => {
            setDayPopup({ date, events: shownEvents })
          }}
          style={{ minHeight: '600px' }}
          culture="es"
          messages={{
            noEventsInRange: 'Sin turnos para este período',
            today: 'Hoy',
            previous: 'Anterior',
            next: 'Siguiente',
            month: 'Mes',
            showMore: (total: number) => `+${total} más`,
          }}
          eventPropGetter={(event: CalendarEvent) => ({
            style: {
              backgroundColor: getEventColor(event.resource.status),
              border: 'none',
              borderRadius: '4px',
              color: 'white',
            },
          })}
          components={{
            event: (props: { event: CalendarEvent }) => <RangeEvent event={props.event} />,
          }}
        />
      </div>

      {dayPopup && (
        <DayEventsModal
          date={dayPopup.date}
          events={dayPopup.events}
          onClose={() => setDayPopup(null)}
          onAppointmentClick={onAppointmentClick}
        />
      )}
    </>
  )
}
