'use client'

// CSS imports — react-big-calendar base only (month view), no DnD styles
import 'react-big-calendar/lib/css/react-big-calendar.css'

import {
  cloneElement,
  useCallback,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react'
import {
  Calendar,
  dateFnsLocalizer,
  Views,
  type DateCellWrapperProps,
  type EventWrapperProps,
} from 'react-big-calendar'
import {
  format,
  parse,
  startOfWeek,
  getDay,
  parseISO,
  addDays,
  isToday,
  formatISO,
} from 'date-fns'
import { es } from 'date-fns/locale'
import {
  type Appointment,
  type CalendarEvent,
  appointmentToCalendarEvent,
} from '@/types/appointments'
import type { DayStatusEntry } from '@/types/holidays'
import { getReadableTextColor } from '@/lib/agenda/turnero-palette'
import {
  buildCellMap,
  computeHourRows,
  floorToStep,
  hhmmFromDate,
  makeGetCell,
  type ApptEntry,
  type TurneroColumn,
} from '@/lib/agenda/turnero-grid'
import { TurneroGrid } from './TurneroGrid'
import { AgendaDayViewSkeleton } from './AgendaDayView'
import { SesionSerieBadge } from './SesionSerieBadge'
import { DayStatusBadge } from './DayStatusBadge'
import { makeMonthDateHeader, makeMonthDayPropGetter } from './MonthDayStatusHeader'

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

// Ancho de la columna HORA — DEBE coincidir con `HOUR_COL_WIDTH` (privado) de
// TurneroGrid.tsx para que la fila de badges de estado del día quede alineada
// con los encabezados de columna de la grilla que está justo debajo.
const WEEK_HOUR_COL_WIDTH = 60

function WeekGridView({
  weekDate,
  events,
  onEventClick,
  onEmptyCellClick,
  dayStatusMap,
  onDayStatusClick,
  onColumnHeaderClick,
}: {
  weekDate: Date
  events: CalendarEvent[]
  onEventClick?: (appointment: Appointment) => void
  /** Click en una celda vacía → atajo "Dar un turno" con esa fecha (=colId, ya
   * es un ISO de día) y hora. Reemplaza el click en hueco libre retirado
   * (pedido ISADI 2026-07-14 de no mostrar huecos en el calendario). */
  onEmptyCellClick?: (date: string, timeHHmm: string) => void
  /** Feriados + decisión de la clínica por fecha (pedido ISADI 2026-07-14).
   * `undefined` = feature sin datos (aún no cargó) → sin badges, sin cambios
   * visuales; el resto del componente sigue funcionando igual que antes. */
  dayStatusMap?: Record<string, DayStatusEntry>
  /** Click en el badge de estado de un día → abre el modal "¿abre o no?". */
  onDayStatusClick?: (date: string) => void
  /**
   * Click en el ENCABEZADO de un día (o en "+N más" de una celda apretada) →
   * abre el modal con todos los turnos de ese día (pedido ISADI 2026-07-14).
   * Se reenvía directo a `TurneroGrid.onColumnHeaderClick`: el `columnId` de
   * la vista Semana YA es la fecha ISO del día, así que no hace falta
   * traducirlo acá.
   */
  onColumnHeaderClick?: (dateIso: string) => void
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

    const columns: TurneroColumn[] = days.map((day) => {
      const dayIso = formatISO(day, { representation: 'date' })
      const count = perDayCount.get(dayIso) ?? 0
      return {
        id: dayIso,
        label: format(day, 'EEE d', { locale: es }),
        // Etiqueta larga para el aria-label del encabezado clickeable (ej.
        // "martes 14" en vez de "mar 14" — más clara para lectores de pantalla).
        fullLabel: format(day, 'EEEE d', { locale: es }),
        sublabel:
          count === 0
            ? 'Sin turnos'
            : `${count} ${count === 1 ? 'turno agendado' : 'turnos agendados'}`,
        isHighlighted: isToday(day),
      }
    })

    const times = apptEntries.map((e) => e.hour)
    const hourRows = computeHourRows(times, { stepMin: WEEK_STEP_MIN })

    // Ya no hay huecos libres que ubicar en la grilla (pedido ISADI 2026-07-14):
    // el tercer argumento siempre es [].
    const cellMap = buildCellMap(hourRows, apptEntries, [])
    const getCell = makeGetCell(cellMap)

    return { columns, hourRows, getCell }
  }, [weekDate, events])

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

  // ── Feriados + estado del día (pedido ISADI 2026-07-14) ─────────────────────
  // Un día CERRADO debe verse inequívocamente cerrado en la grilla (no como un
  // día vacío cualquiera). En vez de tocar TurneroGrid.tsx (compartido con la
  // vista Día), se envuelve `getCell`: las celdas vacías de un día cerrado se
  // fuerzan a `outOfHours: true` — el mismo estilo "rayado apagado, no
  // clickeable" que ya usa la grilla para "fuera de horario". Los turnos YA
  // agendados ese día (si los hubiera) se siguen mostrando normalmente — solo
  // se bloquea ofrecer NUEVOS huecos.
  const closedDayIds = useMemo(() => {
    const set = new Set<string>()
    if (!dayStatusMap) return set
    for (const col of grid.columns) {
      const entry = dayStatusMap[col.id]
      if (entry && !entry.effectiveOpen) set.add(col.id)
    }
    return set
  }, [dayStatusMap, grid.columns])

  const getCell = (colId: string, hour: string) => {
    const cell = grid.getCell(colId, hour)
    if (closedDayIds.has(colId) && cell.appointments.length === 0 && !cell.outOfHours) {
      return { ...cell, outOfHours: true }
    }
    return cell
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Fila de badges "¿este día abre?" — alineada con las columnas de la
          grilla de abajo (mismo ancho de columna HORA). `undefined` en
          dayStatusMap (feature sin datos aún) → no renderiza nada. */}
      {dayStatusMap && (
        <div
          role="row"
          aria-label="Estado de los días de la semana"
          style={{
            display: 'grid',
            gridTemplateColumns: `${WEEK_HOUR_COL_WIDTH}px repeat(${grid.columns.length}, minmax(120px, 1fr))`,
          }}
        >
          <div aria-hidden="true" />
          {grid.columns.map((col) => (
            <div key={`daystatus-${col.id}`} style={{ display: 'flex', justifyContent: 'center', padding: '0 4px' }}>
              <DayStatusBadge entry={dayStatusMap[col.id]} onClick={() => onDayStatusClick?.(col.id)} />
            </div>
          ))}
        </div>
      )}
      <TurneroGrid
        columns={grid.columns}
        hourRows={grid.hourRows}
        getCell={getCell}
        onAppointmentClick={onEventClick}
        onEmptyCellClick={onEmptyCellClick}
        showProfessionalOnChip
        isPastCell={isPastCell}
        nowLine={nowLine}
        ariaLabel="Grilla semanal de turnos"
        onColumnHeaderClick={onColumnHeaderClick}
      />
    </div>
  )
}

// ─── Vista Mes: resumen compacto ──────────────────────────────────────────────
// El detalle (profesional/servicio) vive en el modal del día y en el detalle
// del turno. En el mes cada fila se mantiene deliberadamente en una línea para
// que RBC pueda medir cuántas entran y reemplazar el excedente por "+N turnos"
// sin recortar contenido silenciosamente.
function RangeEvent({ event }: { event: CalendarEvent }) {
  const hour = format(event.start, 'HH:mm')
  const patientName = event.resource.patients?.full_name ?? 'Paciente'

  return (
    <div className="rbc-month-event-summary">
      <span className="rbc-month-event-text">
        <span className="rbc-re-hour">{hour}</span>
        <span> · </span>
        <span>{patientName}</span>
      </span>
    </div>
  )
}

type MonthEventWrapperProps = EventWrapperProps<CalendarEvent> & {
  children?: ReactElement<{
    role?: string
    tabIndex?: number
    'aria-label'?: string
  }>
}

/**
 * RBC renderiza los turnos del mes como `div` sin foco. El wrapper no agrega
 * otra capa al DOM: clona ese mismo nodo y le da la semántica/foco de botón;
 * su `onClick` original sigue siendo la única ruta de mouse de RBC.
 */
function MonthEventWrapper({ event, children }: MonthEventWrapperProps) {
  if (!children) return null

  const hour = format(event.start, 'HH:mm')
  const patientName = event.resource.patients?.full_name ?? 'Paciente'

  return cloneElement(children, {
    role: 'button',
    tabIndex: 0,
    'aria-label': `Abrir turno de ${patientName} a las ${hour}`,
  })
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
            // Barra de color: el color MANUAL del turno si tiene (paleta muda del
            // turnero, pedido ISADI), o un gris neutro si no — ya NO representa
            // el estado (el estado se mantiene en TurnoDetailModal).
            const color = ev.resource.color ?? 'var(--color-border)'
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

// ─── Componente principal ─────────────────────────────────────────────────────
interface CalendarViewRangeReadOnlyProps {
  view: 'week' | 'month'
  date: string // ISO date — fecha de referencia
  appointments: Appointment[]
  isLoading: boolean
  isError: boolean
  onRefetch: () => void
  onAppointmentClick?: (appointment: Appointment) => void
  /**
   * Click en una celda vacía de la grilla Semana → atajo "Dar un turno" con
   * esa fecha y hora prellenadas. Reemplaza el click en hueco libre retirado
   * (pedido ISADI 2026-07-14 de no mostrar huecos en el calendario). Solo
   * aplica a la vista Semana — la vista Mes usa react-big-calendar, sin
   * grilla de celdas propia.
   */
  onEmptyCellClick?: (date: string, timeHHmm: string) => void
  /**
   * Feriados + decisión de la clínica por fecha, ya mergeados (pedido ISADI
   * 2026-07-14) — ver `useDayStatusRange`. Se recibe COMO PROP (no se fetchea
   * acá adentro) para mantener este componente puramente presentacional,
   * igual que `appointments`/`isLoading` — el fetch vive en AgendaView, que
   * es quien sabe el rango visible (Semana/Mes) y ya tiene QueryClientProvider
   * en producción. `undefined` = sin datos todavía → no se renderiza ningún
   * badge/tinte (comportamiento idéntico al de antes de este feature).
   */
  dayStatusMap?: Record<string, DayStatusEntry>
  /** Click en el badge de estado de un día (Semana o Mes) → abre el modal "¿abre o no?". */
  onDayStatusClick?: (date: string) => void
}

export function CalendarViewRangeReadOnly({
  view,
  date,
  appointments,
  isLoading,
  isError,
  onRefetch,
  onAppointmentClick,
  onEmptyCellClick,
  dayStatusMap,
  onDayStatusClick,
}: CalendarViewRangeReadOnlyProps) {
  const [dayPopup, setDayPopup] = useState<{ date: Date; events: CalendarEvent[] } | null>(null)

  // Los CANCELADOS no se muestran en la agenda (Semana/Mes) — decisión 2026-07-14,
  // igual criterio que la vista Día (ver CalendarView.tsx). Los no_show SÍ se
  // muestran. Filtrado acá (no en useAppointmentsRange) porque ese hook no tiene
  // otros consumidores hoy, pero mantenemos el mismo patrón que Día por
  // consistencia y para no acoplar la regla de "qué muestra la agenda" al fetch.
  //
  // Memoizado (dep `[appointments]`, no en cada render) porque
  // `handleDayNumberClick` lo necesita con identidad ESTABLE: si `events`
  // fuera un array nuevo en cada render, `handleDayNumberClick` cambiaría de
  // identidad también, y con él `monthDateHeader` — exactamente lo que ese
  // memo evita (RBC trata `dateHeader` como definición de componente:
  // cambiarla de identidad fuerza un remount visible del encabezado). Se
  // computa ACÁ ARRIBA (antes de los early return de loading/error) porque
  // las Reglas de Hooks exigen que todos los hooks se llamen siempre en el
  // mismo orden, sin returns tempranos entre medio.
  const events = useMemo<CalendarEvent[]>(
    () =>
      appointments
        .filter((apt) => apt && apt.start_at && apt.end_at && apt.status !== 'cancelled')
        .map(appointmentToCalendarEvent),
    [appointments],
  )

  // Click en el ENCABEZADO de un día (Semana o Mes) o en "+N más" de una
  // celda apretada (Semana) → abre el modal con TODOS los turnos de ese día
  // (pedido ISADI 2026-07-14). Único handler compartido por ambas vistas.
  const handleDayNumberClick = useCallback(
    (dateIso: string) => {
      const dayEvents = events.filter(
        (ev) => formatISO(ev.start, { representation: 'date' }) === dateIso,
      )
      setDayPopup({ date: parseISO(dateIso), events: dayEvents })
    },
    [events],
  )

  // Vista Mes — factories memoizadas para no recrear la identidad del
  // componente `dateHeader` en cada render (react-big-calendar las trata como
  // definiciones de componente, no como JSX).
  const monthDateHeader = useMemo(
    () => makeMonthDateHeader(dayStatusMap, onDayStatusClick, handleDayNumberClick),
    [dayStatusMap, onDayStatusClick, handleDayNumberClick],
  )
  const monthDateCellWrapper = useMemo(
    () => {
      const selectedMonth = parseISO(date)

      return function MonthDateCellWrapper({ value, children }: DateCellWrapperProps) {
        const belongsToSelectedMonth =
          value.getFullYear() === selectedMonth.getFullYear() &&
          value.getMonth() === selectedMonth.getMonth()

        if (!belongsToSelectedMonth) {
          return (
            <div
              className="rbc-month-day-wrapper rbc-month-day-wrapper--off-range"
              aria-hidden="true"
            >
              {children}
            </div>
          )
        }

        const dateIso = formatISO(value, { representation: 'date' })

        return (
          // Esta capa amplía solo el target de mouse. No crea otro control
          // accesible ni otro tab stop: el botón del número sigue siendo el
          // acceso semántico/por teclado para consultar el día.
          <div
            className="rbc-month-day-wrapper rbc-month-day-hitarea"
            aria-hidden="true"
            onClick={() => handleDayNumberClick(dateIso)}
          >
            {children}
          </div>
        )
      }
    },
    [date, handleDayNumberClick],
  )
  const monthDayPropGetter = useMemo(() => makeMonthDayPropGetter(dayStatusMap), [dayStatusMap])

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

  // Vista Semana: grilla HORA × DÍA (planilla, sin time-grid de RBC)
  const mainContent: ReactNode =
    view === 'week' ? (
      <WeekGridView
        weekDate={parseISO(date)}
        events={events}
        onEventClick={onAppointmentClick}
        onEmptyCellClick={onEmptyCellClick}
        dayStatusMap={dayStatusMap}
        onDayStatusClick={onDayStatusClick}
        onColumnHeaderClick={handleDayNumberClick}
      />
    ) : (
      // Vista Mes: react-big-calendar con chips adaptativos
      <div className="rbc-wrapper rbc-wrapper--month">
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
          onKeyPressEvent={(event: CalendarEvent, keyboardEvent) => {
            const keyEvent = keyboardEvent as ReactKeyboardEvent<HTMLElement>
            if (keyEvent.key !== 'Enter' && keyEvent.key !== ' ') return
            keyEvent.preventDefault()
            keyEvent.stopPropagation()
            onAppointmentClick?.(event.resource)
          }}
          onShowMore={(_shownEvents: CalendarEvent[], date: Date) => {
            // RBC informa correctamente la fecha, pero según la versión puede
            // entregar solo el subconjunto oculto. Recalcular desde `events`
            // garantiza que el modal liste el día completo y ordenado.
            handleDayNumberClick(formatISO(date, { representation: 'date' }))
          }}
          showAllEvents={false}
          popup={false}
          doShowMoreDrillDown={false}
          style={{ minHeight: '600px' }}
          culture="es"
          messages={{
            noEventsInRange: 'Sin turnos para este período',
            today: 'Hoy',
            previous: 'Anterior',
            next: 'Siguiente',
            month: 'Mes',
            showMore: (total: number) => `+${total} ${total === 1 ? 'turno' : 'turnos'}`,
          }}
          eventPropGetter={(event: CalendarEvent) => {
            // Mismo lenguaje visual que el chip de la grilla (Semana/Día): el
            // color MANUAL del turno (paleta muda del turnero, pedido ISADI) es
            // el ÚNICO que pinta el fondo. Sin color manual, fondo neutro (como
            // una celda sin pintar del Excel) — ya NO cae al color de estado.
            const manualColor = event.resource.color ?? null
            const isCancelled = event.resource.status === 'cancelled'
            return {
              style: {
                backgroundColor: manualColor ?? 'var(--color-surface)',
                border: manualColor ? '1px solid transparent' : '1px solid var(--color-border)',
                borderRadius: 6,
                color: manualColor ? getReadableTextColor(manualColor) : 'var(--color-text-primary)',
                opacity: isCancelled ? 0.55 : 1,
              },
            }
          }}
          dayPropGetter={monthDayPropGetter}
          components={{
            event: (props: { event: CalendarEvent }) => <RangeEvent event={props.event} />,
            eventWrapper: MonthEventWrapper,
            dateCellWrapper: monthDateCellWrapper,
            // `components.month.dateHeader` es la forma tipada (Components<T>
            // de @types/react-big-calendar solo declara `dateHeader` anidado
            // bajo `month`, no en la raíz) — a nivel runtime RBC hace merge de
            // `components[view]` con el resto de `components` (Calendar.js),
            // así que esto es equivalente a un `dateHeader` de nivel raíz.
            month: { dateHeader: monthDateHeader },
          }}
        />
      </div>
    )

  return (
    <>
      {mainContent}

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
