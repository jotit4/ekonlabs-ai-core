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
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  formatISO,
} from 'date-fns'
import { es } from 'date-fns/locale'
import {
  type Appointment,
  type AppointmentStatus,
  type CalendarEvent,
  appointmentToCalendarEvent,
} from '@/types/appointments'
import type { AvailabilityShift, DaySummary } from '@/types/availability'
import { getServiceColor } from '@/lib/agenda/service-visuals'
import { AgendaDayViewSkeleton } from './AgendaDayView'
import { SesionSerieBadge } from './SesionSerieBadge'

const locales = { es }

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }),
  getDay,
  locales,
})

// Color de estado SOLO para la vista Mes (chips de RBC sobre fondo de color
// sólido con texto blanco, donde la identidad por servicio no se usa). La vista
// Semana usa color por servicio (getServiceColor) — ver WeekColumnsView.
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

// Nombre de profesional para agrupar dentro de una columna-día.
const NO_PROFESSIONAL_LABEL = 'Sin profesional'

function eventProfessionalName(event: CalendarEvent): string {
  return (
    event.resource.professionals?.name ??
    event.resource.services?.professional_name ??
    NO_PROFESSIONAL_LABEL
  )
}

// ─── Vista Semana custom ──────────────────────────────────────────────────────
// Reemplaza el time-grid de react-big-calendar, que colapsa cuando hay
// múltiples profesionales con turnos en el mismo horario (columnas angostas
// ilegibles). Esta vista muestra 7 columnas, una por día, con eventos
// apilados en orden cronológico y scroll independiente por columna.

// Item unificado de una columna-día: turno ocupado o hueco libre.
type WeekItem =
  | { kind: 'event'; sortKey: number; event: CalendarEvent }
  | { kind: 'free'; sortKey: number; shift: AvailabilityShift }

function WeekColumnsView({
  weekDate,
  events,
  onEventClick,
  freeShiftsByDate,
  onFreeSlotClick,
}: {
  weekDate: Date
  events: CalendarEvent[]
  onEventClick?: (appointment: Appointment) => void
  freeShiftsByDate?: Record<string, AvailabilityShift[]>
  onFreeSlotClick?: (shift: AvailabilityShift) => void
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

        // Story 10.7 — huecos libres de este día, indexados por la clave `date`
        // del response (fecha local consultada), no recomputados desde el ISO UTC.
        const dayIso = formatISO(day, { representation: 'date' })
        const dayFreeShifts = freeShiftsByDate?.[dayIso] ?? []

        // Lista unificada ordenada cronológicamente (ocupados + libres).
        const dayItems: WeekItem[] = [
          ...dayEvents.map((event): WeekItem => ({
            kind: 'event',
            sortKey: event.start.getTime(),
            event,
          })),
          ...dayFreeShifts.map((shift): WeekItem => ({
            kind: 'free',
            sortKey: parseISO(shift.slot_start_iso).getTime(),
            shift,
          })),
        ].sort((a, b) => a.sortKey - b.sortKey)

        // Agrupar por profesional dentro de la columna-día (cambio "agrupar por
        // profesional"). Orden cronológico preservado dentro de cada grupo;
        // grupos ordenados alfabéticamente por nombre.
        const dayGroupsMap = new Map<string, WeekItem[]>()
        for (const item of dayItems) {
          const name =
            item.kind === 'event'
              ? eventProfessionalName(item.event)
              : item.shift.professional_name || NO_PROFESSIONAL_LABEL
          const bucket = dayGroupsMap.get(name)
          if (bucket) bucket.push(item)
          else dayGroupsMap.set(name, [item])
        }
        const dayGroups = Array.from(dayGroupsMap.entries()).sort((a, b) =>
          a[0].localeCompare(b[0], 'es'),
        )

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

            {/* Lista de turnos (scrollable), agrupada por profesional */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: 4,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {dayGroups.map(([profName, groupItems]) => (
                <div
                  key={`group-${profName}`}
                  role="group"
                  aria-label={`${profName}`}
                  style={{ display: 'flex', flexDirection: 'column', gap: 3 }}
                >
                  {/* Sub-cabecera por profesional dentro de la columna del día */}
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      letterSpacing: '0.03em',
                      textTransform: 'uppercase',
                      color: 'var(--color-text-secondary)',
                      padding: '2px 2px 1px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={profName}
                  >
                    {profName}
                  </div>
                  {groupItems.map((item, idx) => {
                    if (item.kind === 'free') {
                      const shift = item.shift
                      // Tinte muy tenue del color de servicio para el hueco.
                      const svcColor = getServiceColor(shift.service_id)
                      return (
                        <button
                          key={`free-${shift.slot_start_iso}-${shift.professional_id}-${shift.service_id}-${idx}`}
                          onClick={() => onFreeSlotClick?.(shift)}
                          aria-label={`Agendar a las ${shift.open} con ${shift.professional_name}`}
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            background: `${svcColor}08`,
                            border: `1px dashed ${svcColor}66`,
                            borderRadius: 4,
                            padding: '4px 6px',
                            cursor: 'pointer',
                            flexShrink: 0,
                            color: 'var(--color-text-secondary)',
                            opacity: 0.85,
                            transition: 'background 0.12s',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = `${svcColor}14` }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = `${svcColor}08` }}
                        >
                          <div style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.3 }}>
                            {shift.open}
                          </div>
                          <div style={{ fontSize: 10, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            + Libre
                            {shift.service_name ? ` · ${shift.service_name}` : ''}
                          </div>
                        </button>
                      )
                    }

                    const event = item.event
                    // Color por SERVICIO (identidad). El estado queda
                    // distinguible por la opacidad de cancelado/no-show.
                    const color = getServiceColor(event.resource.service_id)
                    const status = event.resource.status
                    const isDimmed = status === 'cancelled' || status === 'no_show'
                    const serviceName = event.resource.services?.name ?? null

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
                          opacity: isDimmed ? 0.55 : 1,
                          textDecoration: status === 'cancelled' ? 'line-through' : 'none',
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
                        {serviceName && (
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
                            {serviceName}
                          </div>
                        )}
                        {event.resource.session_index != null && (
                          <div style={{ marginTop: 3 }}>
                            <SesionSerieBadge
                              sessionIndex={event.resource.session_index}
                              totalSessions={event.resource.treatments?.total_sessions}
                            />
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              ))}
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
                    {ev.resource.session_index != null && (
                      <div style={{ marginTop: 3 }}>
                        <SesionSerieBadge
                          sessionIndex={ev.resource.session_index}
                          totalSessions={ev.resource.treatments?.total_sessions}
                        />
                      </div>
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

// ─── Vista Mes: resumen de disponibilidad (Story 10.7) ────────────────────────
// El time-grid de RBC no expone una API simple para inyectar un indicador por
// celda con el mock de tests; en su lugar mostramos un resumen compacto debajo
// del calendario con "● N libres" / "lleno" por día del mes, leyendo
// `availabilitySummary` (modo summary, liviano). Click → navega a ese día.
function MonthAvailabilitySummary({
  monthDate,
  summary,
  onDayClick,
}: {
  monthDate: Date
  summary: Record<string, DaySummary>
  onDayClick?: (isoDate: string) => void
}) {
  const days = eachDayOfInterval({
    start: startOfMonth(monthDate),
    end: endOfMonth(monthDate),
  })

  return (
    <div
      data-testid="month-availability-summary"
      role="list"
      aria-label="Disponibilidad por día"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
        gap: 6,
        marginTop: 12,
      }}
    >
      {days.map((day) => {
        const iso = formatISO(day, { representation: 'date' })
        const freeCount = summary[iso]?.free_count
        const hasFree = typeof freeCount === 'number' && freeCount > 0
        const label = format(day, "EEE d", { locale: es })

        return (
          <button
            key={iso}
            type="button"
            role="listitem"
            onClick={() => onDayClick?.(iso)}
            aria-label={
              hasFree
                ? `${label}: ${freeCount} libres`
                : `${label}: sin disponibilidad`
            }
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 2,
              padding: '6px 8px',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              background: 'var(--color-bg)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', textTransform: 'capitalize' }}>
              {label}
            </span>
            {hasFree ? (
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-interactive)' }}>
                ● {freeCount} libres
              </span>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                {typeof freeCount === 'number' ? 'lleno' : '—'}
              </span>
            )}
          </button>
        )
      })}
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
  // Story 10.7 — disponibilidad (opcional, aditivo)
  freeShiftsByDate?: Record<string, AvailabilityShift[]> // clave 'YYYY-MM-DD' local
  availabilitySummary?: Record<string, DaySummary>
  // Aceptado por compatibilidad de la llamada actual; el profesional ahora se
  // muestra en la cabecera de cada grupo dentro de la columna del día.
  showProfessionalName?: boolean
  onFreeSlotClick?: (shift: AvailabilityShift) => void
  onDayClick?: (isoDate: string) => void
}

export function CalendarViewRangeReadOnly({
  view,
  date,
  appointments,
  isLoading,
  isError,
  onRefetch,
  onAppointmentClick,
  freeShiftsByDate,
  availabilitySummary,
  onFreeSlotClick,
  onDayClick,
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
        freeShiftsByDate={freeShiftsByDate}
        onFreeSlotClick={onFreeSlotClick}
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

      {availabilitySummary && (
        <MonthAvailabilitySummary
          monthDate={parseISO(date)}
          summary={availabilitySummary}
          onDayClick={onDayClick}
        />
      )}

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
