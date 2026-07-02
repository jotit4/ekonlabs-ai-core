'use client'

// CSS imports — react-big-calendar base only (month view), no DnD styles
import 'react-big-calendar/lib/css/react-big-calendar.css'

import { useMemo, useState } from 'react'
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar'
import {
  format,
  parse,
  startOfWeek,
  getDay,
  parseISO,
  addDays,
  isToday,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  formatISO,
} from 'date-fns'
import { es } from 'date-fns/locale'
import {
  type Appointment,
  type CalendarEvent,
  appointmentToCalendarEvent,
} from '@/types/appointments'
import type { AvailabilityShift, DaySummary } from '@/types/availability'
import { getStatusColor } from '@/lib/agenda/status-colors'
import {
  buildCellMap,
  computeHourRows,
  floorToStep,
  hhmmFromDate,
  makeGetCell,
  type ApptEntry,
  type FreeEntry,
  type TurneroColumn,
} from '@/lib/agenda/turnero-grid'
import { TurneroGrid } from './TurneroGrid'
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

// Paso de la grilla semanal: 60 min (igual que la vista Día).
const WEEK_STEP_MIN = 60

// ─── Vista Semana: grilla HORA × DÍA ──────────────────────────────────────────
// Reemplaza las listas apiladas por una planilla tipo Excel: filas = franjas
// horarias, columnas = 7 días. Una celda día×hora = chip(s) compacto(s) con el
// profesional indicado. Los huecos libres se muestran individualmente si son
// pocos, o colapsados a "N libres" si son muchos (menos ruido).

function WeekGridView({
  weekDate,
  events,
  onEventClick,
  freeShiftsByDate,
  availabilityLoading = false,
  onFreeSlotClick,
}: {
  weekDate: Date
  events: CalendarEvent[]
  onEventClick?: (appointment: Appointment) => void
  freeShiftsByDate?: Record<string, AvailabilityShift[]>
  availabilityLoading?: boolean
  onFreeSlotClick?: (shift: AvailabilityShift) => void
}) {
  const grid = useMemo(() => {
    // Ventana de 7 días DESDE la fecha ancla (weekDate). El ancla es la PRIMERA
    // columna; no se muestran días previos. Coherente con el rango que arma
    // AgendaView ([ancla .. ancla+6]).
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekDate, i))
    const dayIsos = new Set(days.map((d) => formatISO(d, { representation: 'date' })))

    const apptEntries: ApptEntry[] = []
    const perDayCount = new Map<string, number>()
    for (const event of events) {
      const dayIso = formatISO(event.start, { representation: 'date' })
      if (!dayIsos.has(dayIso)) continue
      apptEntries.push({
        colId: dayIso,
        hour: floorToStep(hhmmFromDate(event.start), WEEK_STEP_MIN),
        apt: event.resource,
      })
      perDayCount.set(dayIso, (perDayCount.get(dayIso) ?? 0) + 1)
    }

    const freeEntries: FreeEntry[] = []
    for (const [dayIso, shifts] of Object.entries(freeShiftsByDate ?? {})) {
      if (!dayIsos.has(dayIso)) continue
      for (const shift of shifts) {
        freeEntries.push({
          colId: dayIso,
          hour: floorToStep(shift.open, WEEK_STEP_MIN),
          shift,
        })
      }
    }

    const columns: TurneroColumn[] = days.map((day) => {
      const dayIso = formatISO(day, { representation: 'date' })
      const count = perDayCount.get(dayIso) ?? 0
      return {
        id: dayIso,
        label: format(day, 'EEE d', { locale: es }),
        sublabel:
          count === 0
            ? 'Sin turnos'
            : `${count} ${count === 1 ? 'turno agendado' : 'turnos agendados'}`,
        isHighlighted: isToday(day),
      }
    })

    const times = [...apptEntries.map((e) => e.hour), ...freeEntries.map((e) => e.hour)]
    const hourRows = computeHourRows(times, { stepMin: WEEK_STEP_MIN })

    const cellMap = buildCellMap(hourRows, apptEntries, freeEntries)
    const getCell = makeGetCell(cellMap)

    return { columns, hourRows, getCell }
  }, [weekDate, events, freeShiftsByDate])

  // "Ahora": en la columna del día de hoy, las horas pasadas se atenúan y una
  // línea marca la hora actual. Solo si hoy cae dentro de la semana mostrada.
  const now = new Date()
  const todayIso = formatISO(now, { representation: 'date' })
  const nowHHMM = format(now, 'HH:mm')
  const todayInWeek = grid.columns.some((c) => c.id === todayIso)
  const isPastCell = todayInWeek
    ? (colId: string, hour: string) => colId === todayIso && hour < nowHHMM
    : undefined
  const nowAtHour = todayInWeek ? grid.hourRows.find((h) => h >= nowHHMM) : undefined
  const nowLine = nowAtHour
    ? { atHour: nowAtHour, appliesToColumn: (colId: string) => colId === todayIso }
    : undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <TurneroGrid
        columns={grid.columns}
        hourRows={grid.hourRows}
        getCell={grid.getCell}
        onAppointmentClick={onEventClick}
        onFreeSlotClick={onFreeSlotClick}
        showProfessionalOnChip
        isPastCell={isPastCell}
        nowLine={nowLine}
        availabilityLoading={availabilityLoading}
        ariaLabel="Grilla semanal de turnos"
      />
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
            const color = getStatusColor(ev.resource.status)
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
  // Disponibilidad aún cargando → skeleton tenue en las celdas de la grilla Semana.
  availabilityLoading?: boolean
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
  availabilityLoading = false,
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

  // Vista Semana: grilla HORA × DÍA (planilla, sin time-grid de RBC)
  if (view === 'week') {
    return (
      <WeekGridView
        weekDate={parseISO(date)}
        events={events}
        onEventClick={onAppointmentClick}
        freeShiftsByDate={freeShiftsByDate}
        availabilityLoading={availabilityLoading}
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
          eventPropGetter={(event: CalendarEvent) => {
            // Mismo lenguaje visual que el chip de la grilla (Semana/Día): fondo
            // tenue del color de estado + barra de color a la izquierda + texto
            // oscuro. NO fondo sólido (se leía distinto y peor).
            const color = getStatusColor(event.resource.status)
            const isCancelled = event.resource.status === 'cancelled'
            return {
              style: {
                backgroundColor: `${color}1a`,
                borderTop: 'none',
                borderRight: 'none',
                borderBottom: 'none',
                borderLeft: `3px solid ${color}`,
                borderRadius: '0 6px 6px 0',
                color: 'var(--color-text-primary)',
                opacity: isCancelled ? 0.55 : 1,
              },
            }
          }}
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
