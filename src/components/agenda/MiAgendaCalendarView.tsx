'use client'

// CSS imports en orden obligatorio — react-big-calendar primero, luego DnD addon
import 'react-big-calendar/lib/css/react-big-calendar.css'
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'

import { useMemo } from 'react'
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar'
// withDragAndDrop: import ESM para que vi.mock lo intercepte correctamente en tests
// El cast any es necesario porque los tipos genéricos de CJS no son compatibles con strict mode
import withDragAndDropImport from 'react-big-calendar/lib/addons/dragAndDrop'
import { format, parse, startOfWeek, getDay, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Clock } from 'lucide-react'
import {
  type Appointment,
  type AppointmentStatus,
  type CalendarEvent,
  appointmentToCalendarEvent,
} from '@/types/appointments'
import { AgendaDayViewSkeleton } from './AgendaDayView'

// Cast controlado para compatibilidad con tipos CJS de react-big-calendar en strict mode
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const withDragAndDrop: (Cal: typeof Calendar) => any = withDragAndDropImport as any

const locales = { es }

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
})

// withDragAndDrop cast controlado — los tipos de CJS no son compatibles con strict mode
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DragAndDropCalendar = withDragAndDrop(Calendar) as any

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

interface MiAgendaCalendarViewProps {
  date: string
  appointments: Appointment[]
  isLoading: boolean
  isError: boolean
  onRefetch: () => void
}

function ReadOnlyEvent({ event }: { event: CalendarEvent }) {
  const isPendingSync = event.resource.calendar_event_id === null

  return (
    <div className="flex items-start justify-between gap-1 h-full px-1 py-0.5 text-xs">
      <span className="truncate leading-tight">{event.title}</span>
      {isPendingSync && (
        <Clock
          className="w-3 h-3 shrink-0 opacity-70"
          aria-label="Pendiente de sincronización con Google Calendar"
        />
      )}
    </div>
  )
}

export function MiAgendaCalendarView({
  date,
  appointments,
  isLoading,
  isError,
  onRefetch,
}: MiAgendaCalendarViewProps) {
  // Vista solo lectura — sin drag & drop, sin optimistic updates
  // useMemo es suficiente ya que no hay mutaciones locales de eventos
  const events = useMemo(
    () => appointments.map(appointmentToCalendarEvent),
    [appointments]
  )

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

  return (
    <div className="rbc-wrapper">
      {/* Sin SyncStatusBanner ni GCalDegradationBanner — vista solo lectura del profesional */}
      <DragAndDropCalendar
        localizer={localizer}
        events={events}
        defaultView={Views.DAY}
        views={[Views.DAY]}
        date={parseISO(date)}
        onNavigate={() => {
          // navegación de fecha la maneja page.tsx
        }}
        toolbar={false}
        onEventDrop={undefined}
        onEventResize={undefined}
        step={30}
        timeslots={2}
        min={new Date(0, 0, 0, 7, 0, 0)}
        max={new Date(0, 0, 0, 21, 0, 0)}
        style={{ height: 'calc(100vh - 280px)', minHeight: '500px' }}
        culture="es"
        messages={{
          noEventsInRange: 'Sin turnos para hoy',
          today: 'Hoy',
          previous: 'Anterior',
          next: 'Siguiente',
          day: 'Día',
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
          event: (props: { event: CalendarEvent }) => (
            <ReadOnlyEvent event={props.event} />
          ),
        }}
      />
    </div>
  )
}
