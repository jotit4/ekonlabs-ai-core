'use client'

// CSS imports — react-big-calendar base only, no DnD styles
import 'react-big-calendar/lib/css/react-big-calendar.css'

import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay, parseISO } from 'date-fns'
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

function getEventColor(status: AppointmentStatus): string {
  switch (status) {
    case 'confirmed':
      return 'var(--color-interactive)'
    case 'rescheduled':
      return '#f97316'
    case 'cancelled':
      return 'var(--color-text-secondary)'
    case 'no_show':
      return '#ef4444'
    case 'pending':
    case 'pending_calendar':
    default:
      return '#8b5cf6'
  }
}

function RangeEvent({ event }: { event: CalendarEvent }) {
  const professionalName =
    event.resource.professionals?.name ??
    event.resource.services?.professional_name ??
    null

  return (
    <div className="flex flex-col gap-0 h-full px-1 py-0.5 text-xs cursor-pointer">
      <span className="truncate leading-tight">
        {event.resource.patients?.full_name ?? 'Paciente'}
      </span>
      {professionalName && (
        <span className="text-[10px] opacity-80 truncate">{professionalName}</span>
      )}
    </div>
  )
}

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

  const calendarView = view === 'week' ? Views.WEEK : Views.MONTH
  const calendarStyle =
    view === 'week'
      ? { height: 'calc(100vh - 240px)', minHeight: '500px' }
      : { minHeight: '600px' }

  const weekProps =
    view === 'week'
      ? {
          step: 30,
          timeslots: 2,
          min: new Date(0, 0, 0, 7, 0, 0),
          max: new Date(0, 0, 0, 21, 0, 0),
        }
      : {}

  return (
    <div className="rbc-wrapper">
      <Calendar
        localizer={localizer}
        events={events}
        view={calendarView}
        onView={() => {}}
        views={[Views.WEEK, Views.MONTH]}
        date={parseISO(date)}
        onNavigate={() => {}}
        toolbar={false}
        onSelectEvent={(event: CalendarEvent) => {
          onAppointmentClick?.(event.resource)
        }}
        {...weekProps}
        style={calendarStyle}
        culture="es"
        messages={{
          noEventsInRange: 'Sin turnos para este período',
          today: 'Hoy',
          previous: 'Anterior',
          next: 'Siguiente',
          week: 'Semana',
          month: 'Mes',
          day: 'Día',
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
  )
}
