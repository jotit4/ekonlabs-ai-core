'use client'

// CSS imports en orden obligatorio — react-big-calendar primero, luego DnD addon
import 'react-big-calendar/lib/css/react-big-calendar.css'
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'

import { useState, useRef } from 'react'
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar'
// withDragAndDrop: import ESM para que vi.mock lo intercepte correctamente en tests
// El cast any es necesario porque los tipos genéricos de CJS no son compatibles con strict mode
import withDragAndDropImport from 'react-big-calendar/lib/addons/dragAndDrop'
import { format, parse, startOfWeek, getDay, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Pencil, Clock } from 'lucide-react'
import {
  type Appointment,
  type AppointmentStatus,
  type CalendarEvent,
  appointmentToCalendarEvent,
} from '@/types/appointments'
import { AgendaDayViewSkeleton } from './AgendaDayView'
import { RescheduleConfirmModal } from './RescheduleConfirmModal'

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

interface EventInteractionArgs {
  event: CalendarEvent
  start: Date | string
  end: Date | string
}

interface PendingDrop {
  event: CalendarEvent
  originalStart: Date
  originalEnd: Date
  newStart: Date
  newEnd: Date
}

interface CalendarViewProps {
  date: string
  appointments: Appointment[]
  isLoading: boolean
  isError: boolean
  onRefetch: () => void
  onReschedule?: (appointment: Appointment) => void
}

function CustomEvent({
  event,
  onReschedule,
}: {
  event: CalendarEvent
  onReschedule?: (appointment: Appointment) => void
}) {
  const isPendingSync = event.resource.calendar_event_id === null
  const professionalName =
    event.resource.professionals?.name ??
    event.resource.services?.professional_name ??
    null

  return (
    <div className="flex items-start justify-between gap-1 h-full px-1 py-0.5 text-xs">
      <div className="flex flex-col gap-0 min-w-0 flex-1">
        <span className="truncate leading-tight">{event.title}</span>
        {professionalName && (
          <span className="text-[10px] opacity-80 truncate">{professionalName}</span>
        )}
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        {isPendingSync && (
          <Clock
            className="w-3 h-3 shrink-0 opacity-70"
            aria-label="Pendiente de sincronización con Google Calendar"
          />
        )}
        {onReschedule && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onReschedule(event.resource)
            }}
            className="shrink-0 min-h-[20px] min-w-[20px] flex items-center justify-center rounded hover:bg-white/20 transition-colors"
            aria-label={`Reprogramar turno de ${event.resource.patients?.full_name ?? 'paciente'}`}
            title="Reprogramar"
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  )
}

export function CalendarView({
  date,
  appointments,
  isLoading,
  isError,
  onRefetch,
  onReschedule,
}: CalendarViewProps) {
  const queryClient = useQueryClient()

  // Todos los hooks ANTES de cualquier early return

  // localEvents: estado derivado de appointments + optimistic updates
  // Usamos useState inicializado con la primera versión de appointments
  const [localEvents, setLocalEvents] = useState<CalendarEvent[]>(() =>
    appointments.map(appointmentToCalendarEvent)
  )
  // Guardamos la ref de appointments para detectar cambios sin useEffect
  const prevAppointmentsRef = useRef(appointments)
  // Si appointments cambió (nueva data del servidor), sincronizar localEvents
  if (prevAppointmentsRef.current !== appointments) {
    prevAppointmentsRef.current = appointments
    // Aplicar sincronización durante el render (React docs: "during render" pattern)
    setLocalEvents(appointments.map(appointmentToCalendarEvent))
  }

  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Ref para acceder al pendingDrop actual dentro de async handlers sin stale closure
  const pendingDropRef = useRef<PendingDrop | null>(null)
  pendingDropRef.current = pendingDrop

  // Early returns después de todos los hooks
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

  function handleEventDrop({ event, start, end }: EventInteractionArgs) {
    // Fix A-14: No mover turnos cancelados o no-show
    const status = event.resource.status
    if (status === 'cancelled' || status === 'no_show') return

    const newStart = start instanceof Date ? start : new Date(start)
    const newEnd = end instanceof Date ? end : new Date(end)

    // 1. Optimistic update inmediato
    setLocalEvents((prev) =>
      prev.map((e) => e.id === event.id ? { ...e, start: newStart, end: newEnd } : e)
    )

    // 2. Guardar estado pendiente — el modal se abre al detectar pendingDrop !== null
    setPendingDrop({
      event,
      originalStart: event.start,
      originalEnd: event.end,
      newStart,
      newEnd,
    })
  }

  function revertDrop(drop: PendingDrop) {
    setLocalEvents((prev) =>
      prev.map((e) =>
        e.id === drop.event.id
          ? { ...e, start: drop.originalStart, end: drop.originalEnd }
          : e
      )
    )
    setPendingDrop(null)
  }

  async function handleConfirmReschedule() {
    const drop = pendingDropRef.current
    if (!drop) return
    setIsSubmitting(true)

    try {
      const response = await fetch(`/api/appointments/${drop.event.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_at: drop.newStart.toISOString(),
          end_at: drop.newEnd.toISOString(),
        }),
      })

      if (response.ok) {
        queryClient.invalidateQueries({ queryKey: ['agenda', 'day', date] })
        setPendingDrop(null)
      } else if (response.status === 409) {
        revertDrop(drop)
        toast.error('Ese horario ya no está disponible')
      } else {
        revertDrop(drop)
        toast.error('No se pudo reprogramar el turno', {
          action: {
            label: 'Reintentar',
            onClick: () => void handleConfirmReschedule(),
          },
        })
      }
    } catch {
      revertDrop(drop)
      toast.error('Error de conexión al reprogramar')
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleCancelReschedule() {
    const drop = pendingDropRef.current
    if (!drop) return
    revertDrop(drop)
  }

  const pendingPatientName = pendingDrop?.event.resource.patients?.full_name ?? 'Paciente'
  const pendingOriginalTime = pendingDrop ? format(pendingDrop.originalStart, 'HH:mm') : ''
  const pendingNewTime = pendingDrop ? format(pendingDrop.newStart, 'HH:mm') : ''

  return (
    <div className="rbc-wrapper">
      <DragAndDropCalendar
        localizer={localizer}
        events={localEvents}
        defaultView={Views.DAY}
        views={[Views.DAY]}
        date={parseISO(date)}
        onNavigate={() => {
          // navegación de fecha la maneja page.tsx
        }}
        toolbar={false}
        onEventDrop={handleEventDrop}
        onEventResize={undefined}
        step={30}
        timeslots={2}
        min={new Date(0, 0, 0, 7, 0, 0)}
        max={new Date(0, 0, 0, 21, 0, 0)}
        style={{ height: 'calc(100vh - 280px)', minHeight: '500px' }}
        culture="es"
        messages={{
          noEventsInRange: 'Sin turnos para este día',
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
            <CustomEvent event={props.event} onReschedule={onReschedule} />
          ),
        }}
      />

      <RescheduleConfirmModal
        open={pendingDrop !== null}
        patientName={pendingPatientName}
        originalTime={pendingOriginalTime}
        newTime={pendingNewTime}
        onConfirm={() => void handleConfirmReschedule()}
        onCancel={handleCancelReschedule}
        isSubmitting={isSubmitting}
      />
    </div>
  )
}
