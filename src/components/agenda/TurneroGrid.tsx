'use client'

import { Fragment } from 'react'
import { type Appointment, STATUS_LABELS } from '@/types/appointments'
import { getReadableTextColor } from '@/lib/agenda/turnero-palette'
import {
  hhmmFromDate,
  type TurneroColumn,
  type TurneroCell,
} from '@/lib/agenda/turnero-grid'
import { SesionSerieBadge } from './SesionSerieBadge'
import { ReminderBadge } from './ReminderBadge'

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type { TurneroColumn, TurneroCell }

export interface TurneroGridProps {
  columns: TurneroColumn[]
  /** Filas de hora ('HH:MM') de arriba hacia abajo. */
  hourRows: string[]
  /** Accessor: contenido de la celda dada (columna, hora). */
  getCell: (columnId: string, hour: string) => TurneroCell
  onAppointmentClick?: (apt: Appointment) => void
  /**
   * Click en una celda VACÍA dentro del horario (sin turno) → atajo "Dar un
   * turno" con esa fecha/hora prellenada. Reemplaza el click en hueco libre
   * (retirado — pedido ISADI 2026-07-14 de no mostrar huecos en el calendario).
   * Recibe (columnId, hour); cada vista (Día/Semana) traduce columnId a fecha
   * y, si aplica, a profesional.
   */
  onEmptyCellClick?: (columnId: string, hour: string) => void
  /** En vista Semana el chip muestra el profesional (la columna es un día). */
  showProfessionalOnChip?: boolean
  /** ¿La celda (columna, hora) es una hora ya pasada de hoy? → se atenúa. */
  isPastCell?: (columnId: string, hour: string) => boolean
  /** Línea de "ahora": se dibuja sobre la fila `atHour` en las columnas que matchean. */
  nowLine?: { atHour: string; appliesToColumn: (columnId: string) => boolean }
  ariaLabel?: string
  /**
   * Click en el ENCABEZADO de una columna (el número/nombre del día) → abre
   * el modal con TODOS los turnos de esa columna (pedido ISADI 2026-07-14 de
   * poder abrir un día apretado). Opcional a propósito: la vista Día
   * (columnas = profesionales, `CalendarView.tsx`) NO lo pasa, así que su
   * encabezado sigue siendo texto plano, sin cambios.
   *
   * Se reutiliza también para el botón "+N más" de `GridCell`: ambos abren el
   * mismo modal de turnos del día, por eso comparten esta única prop en vez
   * de tener un callback separado para cada disparador.
   */
  onColumnHeaderClick?: (columnId: string) => void
}

const HOUR_COL_WIDTH = 60
const ROW_MIN_HEIGHT = 56
// Color de la línea de "ahora" (patrón calendario). Rojo reconocible.
const NOW_COLOR = '#ef4444'
// Máximo de chips de turno visibles por celda antes de colapsar a "+N más".
// Solo aplica cuando `onColumnHeaderClick` está presente (vista Semana) — sin
// él (vista Día) la celda sigue apilando todos los turnos, sin límite, para
// no cambiar su comportamiento actual.
const MAX_CHIPS_PER_CELL = 2

// ─── Chip de turno ocupado ────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  confirmed: '#34c759',
  completed: '#34c759',
  pending: '#ff9f0a',
  rescheduled: '#ff9f0a',
  cancelled: 'rgba(0,0,0,0.2)',
  no_show: '#ff3b30',
}

function professionalNameOf(apt: Appointment): string | null {
  return apt.professionals?.name ?? apt.services?.professional_name ?? null
}

function TurnoChip({
  apt,
  rowHour,
  showProfessional,
  onClick,
}: {
  apt: Appointment
  rowHour: string
  showProfessional?: boolean
  onClick?: (apt: Appointment) => void
}) {
  const status = apt.status
  const isCancelled = status === 'cancelled'
  const patientName = apt.patients?.full_name ?? 'Paciente'
  const serviceName = apt.services?.name ?? null
  const profName = professionalNameOf(apt)
  const exactTime = hhmmFromDate(new Date(apt.start_at))
  // Mostrar la hora en el chip solo cuando difiere del inicio de la fila
  // (ej. un turno a las 09:30 dentro de la fila 09:00). Si coincide, la
  // columna HORA ya la ancla → no se repite (planilla limpia).
  const showTime = exactTime !== rowHour

  // Color MANUAL (paleta muda del turnero, pedido ISADI 2026-07-14) — es el
  // ÚNICO color que pinta el turno. Sin color manual, el chip queda neutro
  // (como una celda sin pintar del Excel): NUNCA cae al color de estado.
  // El estado sigue existiendo como dato (aria-label + TurnoDetailModal),
  // solo desapareció su representación VISUAL del calendario.
  const manualColor = apt.color ?? null
  const textColor = manualColor ? getReadableTextColor(manualColor) : 'var(--color-text-primary)'
  const secondaryTextColor = manualColor ? textColor : 'var(--color-text-secondary)'

  const ariaParts = [
    patientName,
    exactTime,
    showProfessional && profName ? profName : null,
    STATUS_LABELS[status],
  ].filter(Boolean)

  const subLine = [serviceName, showProfessional ? profName : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <button
      type="button"
      onClick={() => onClick?.(apt)}
      aria-label={ariaParts.join(' · ')}
      title={`${patientName}${serviceName ? ` — ${serviceName}` : ''}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        width: '100%',
        textAlign: 'left',
        background: manualColor ?? 'var(--color-surface)',
        borderTop: manualColor ? '1px solid transparent' : '1px solid var(--color-border)',
        borderRight: manualColor ? '1px solid transparent' : '1px solid var(--color-border)',
        borderBottom: manualColor ? '1px solid transparent' : '1px solid var(--color-border)',
        borderLeft: `6px solid ${STATUS_COLORS[status] || 'rgba(0,0,0,0.2)'}`,
        borderRadius: 6,
        padding: '4px 6px 4px 8px',
        cursor: onClick ? 'pointer' : 'default',
        opacity: isCancelled ? 0.55 : 1,
        boxShadow: 'none',
        transition: 'box-shadow 0.12s',
        overflow: 'hidden',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'inset 0 0 0 100px rgba(0,0,0,0.06)' }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none' }}
    >
      {showTime && (
        <span style={{ fontSize: 10, fontWeight: 700, color: secondaryTextColor, lineHeight: 1.2 }}>
          {exactTime}
        </span>
      )}
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: textColor,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          lineHeight: 1.25,
          textDecoration: isCancelled ? 'line-through' : 'none',
        }}
      >
        {patientName}
      </span>
      {subLine && (
        <span
          style={{
            fontSize: 10.5,
            color: secondaryTextColor,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            lineHeight: 1.25,
          }}
        >
          {subLine}
        </span>
      )}
      <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginTop: 1 }}>
        <ReminderBadge
          reminderSentAt={apt.reminder_sent_at}
          attendanceConfirmed={apt.attendance_confirmed}
        />
        <SesionSerieBadge
          sessionIndex={apt.session_index}
          totalSessions={apt.treatments?.total_sessions}
        />
      </span>
    </button>
  )
}

// ─── Celda vacía clickeable ───────────────────────────────────────────────────
// Reemplaza el chip de hueco libre retirado (pedido ISADI 2026-07-14: no
// mostrar huecos en el calendario). Sin datos de disponibilidad, la celda no
// puede anunciar profesional/servicio — solo ofrece el atajo "Dar un turno" a
// esa fecha/hora; el detalle se completa a mano en el modal.

function EmptyCell({
  columnId,
  columnLabel,
  hour,
  nowBorder,
  onClick,
}: {
  columnId: string
  /** Etiqueta de la columna (profesional en Día, día en Semana) — sin esto,
   * dos columnas vacías en la misma fila comparten el mismo texto accesible
   * ("Dar un turno a las 10:00" × N columnas), ambiguo para lectores de
   * pantalla. Con label: "Dar un turno a las 10:00 — Dra. Pérez" / "— mar 14". */
  columnLabel?: string
  hour: string
  nowBorder?: string
  onClick?: (columnId: string, hour: string) => void
}) {
  const label = `Dar un turno a las ${hour}${columnLabel ? ` — ${columnLabel}` : ''}`
  return (
    <button
      type="button"
      onClick={() => onClick?.(columnId, hour)}
      aria-label={label}
      title={label}
      className="turnero-empty-cell"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        minHeight: ROW_MIN_HEIGHT,
        padding: 3,
        background: 'var(--color-bg)',
        border: 'none',
        borderRight: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
        borderTop: nowBorder,
        borderRadius: 0,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 0.12s',
      }}
    >
      <span
        aria-hidden="true"
        className="turnero-empty-plus"
        style={{ fontSize: 15, fontWeight: 400, lineHeight: 1, opacity: 0, color: 'var(--color-text-secondary)' }}
      >
        +
      </span>
    </button>
  )
}

// ─── Celda ────────────────────────────────────────────────────────────────────

function GridCell({
  cell,
  columnId,
  columnLabel,
  hour,
  showProfessionalOnChip,
  isPast = false,
  showNowLine = false,
  onAppointmentClick,
  onEmptyCellClick,
  onColumnHeaderClick,
}: {
  cell: TurneroCell
  columnId: string
  columnLabel?: string
  hour: string
  showProfessionalOnChip?: boolean
  isPast?: boolean
  showNowLine?: boolean
  onAppointmentClick?: (apt: Appointment) => void
  onEmptyCellClick?: (columnId: string, hour: string) => void
  /** Ver doc en `TurneroGridProps.onColumnHeaderClick`. Cuando está presente,
   * la celda cap-ea los chips visibles y ofrece "+N más" con el mismo handler. */
  onColumnHeaderClick?: (columnId: string) => void
}) {
  const { appointments, outOfHours } = cell
  const hasAppointments = appointments.length > 0
  const isEmpty = !hasAppointments
  const nowBorder = showNowLine ? `2px solid ${NOW_COLOR}` : undefined

  // Hora ya pasada de HOY, sin contenido → gris liso tenue. Distinto del rayado
  // de "fuera de horario": acá SÍ se atiende, pero la hora ya pasó.
  if (isEmpty && isPast && !outOfHours) {
    return (
      <div
        aria-hidden="true"
        style={{
          minHeight: ROW_MIN_HEIGHT,
          borderRight: '1px solid var(--color-border)',
          borderBottom: '1px solid var(--color-border)',
          borderTop: nowBorder,
          background: 'var(--color-surface)',
          opacity: 0.4,
        }}
      />
    )
  }

  // Fuera de horario / sin disponibilidad → gris apagado rayado, no clickeable.
  if (isEmpty && outOfHours) {
    return (
      <div
        aria-hidden="true"
        style={{
          minHeight: ROW_MIN_HEIGHT,
          borderRight: '1px solid var(--color-border)',
          borderBottom: '1px solid var(--color-border)',
          borderTop: nowBorder,
          background:
            'repeating-linear-gradient(135deg, var(--color-surface), var(--color-surface) 6px, transparent 6px, transparent 12px)',
          opacity: 0.5,
        }}
      />
    )
  }

  // Hueco dentro del horario, sin turno → clickeable: abre "Dar un turno" con
  // esa fecha/hora prellenada (reemplaza el chip de hueco libre retirado).
  if (isEmpty) {
    return (
      <EmptyCell
        columnId={columnId}
        columnLabel={columnLabel}
        hour={hour}
        nowBorder={nowBorder}
        onClick={onEmptyCellClick}
      />
    )
  }

  // Superposición apretada (pedido ISADI 2026-07-14): con `onColumnHeaderClick`
  // disponible (vista Semana) se cap-ean los chips visibles y el resto se
  // resume en "+N más", que abre el mismo modal de turnos del día. Sin ese
  // callback (vista Día) se sigue apilando TODO sin límite — cero cambio.
  const canCollapse = !!onColumnHeaderClick
  const visibleAppointments =
    canCollapse && appointments.length > MAX_CHIPS_PER_CELL
      ? appointments.slice(0, MAX_CHIPS_PER_CELL)
      : appointments
  const hiddenCount = appointments.length - visibleAppointments.length

  return (
    <div
      style={{
        minHeight: ROW_MIN_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        padding: 3,
        borderRight: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
        borderTop: nowBorder,
        background: isPast ? 'var(--color-surface)' : 'var(--color-bg)',
        opacity: isPast ? 0.7 : 1,
      }}
    >
      {visibleAppointments.map((apt) => (
        <TurnoChip
          key={apt.appointment_id}
          apt={apt}
          rowHour={hour}
          showProfessional={showProfessionalOnChip}
          onClick={onAppointmentClick}
        />
      ))}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => onColumnHeaderClick?.(columnId)}
          aria-label={`Ver ${hiddenCount} ${hiddenCount === 1 ? 'turno más' : 'turnos más'} de ${columnLabel ?? 'este día'}`}
          className="turnero-show-more"
          style={{
            width: '100%',
            minHeight: 32,
            padding: '6px 4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--color-interactive)',
            background: 'color-mix(in srgb, var(--color-interactive) 8%, transparent)',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          +{hiddenCount} más
        </button>
      )}
    </div>
  )
}

// ─── Grilla ───────────────────────────────────────────────────────────────────

export function TurneroGrid({
  columns,
  hourRows,
  getCell,
  onAppointmentClick,
  onEmptyCellClick,
  showProfessionalOnChip,
  isPastCell,
  nowLine,
  ariaLabel = 'Grilla de turnos',
  onColumnHeaderClick,
}: TurneroGridProps) {
  const gridTemplateColumns = `${HOUR_COL_WIDTH}px repeat(${columns.length}, minmax(120px, 1fr))`

  const headerBase: React.CSSProperties = {
    position: 'sticky',
    top: 0,
    zIndex: 3,
    background: 'var(--color-surface)',
    borderRight: '1px solid var(--color-border)',
    borderBottom: '1px solid var(--color-border)',
    padding: '6px 8px',
  }

  return (
    <>
      {/* Estilos de interacción de la celda vacía clickeable (hover → aparece el "+"). */}
      <style>{`
        .turnero-empty-cell:hover {
          background: var(--color-surface) !important;
        }
        .turnero-empty-cell:hover .turnero-empty-plus { opacity: 0.6 !important; }
        .turnero-empty-cell:focus-visible {
          outline: 2px solid var(--color-interactive);
          outline-offset: -2px;
        }
        .turnero-header-btn:hover { text-decoration: underline; }
        .turnero-header-btn:focus-visible {
          outline: 2px solid var(--color-interactive);
          outline-offset: 2px;
          border-radius: 4px;
        }
        .turnero-show-more:hover { background: color-mix(in srgb, var(--color-interactive) 16%, transparent) !important; }
        .turnero-show-more:focus-visible {
          outline: 2px solid var(--color-interactive);
          outline-offset: -2px;
        }
      `}</style>

      <div
        aria-label={ariaLabel}
        style={{
          // Sin scroll propio: scrollea la página (un solo scrollbar). Los
          // encabezados sticky se anclan respecto al <main> del layout.
          overflow: 'visible',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns, minWidth: 'fit-content' }}>
          {/* Esquina sticky (HORA) */}
          <div
            style={{
              ...headerBase,
              left: 0,
              zIndex: 4,
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--color-text-secondary)',
              display: 'flex',
              alignItems: 'flex-end',
            }}
          >
            Hora
          </div>

          {/* Encabezados de columna */}
          {columns.map((col) => (
            <div
              key={`head-${col.id}`}
              style={{
                ...headerBase,
                textAlign: 'center',
                background: col.isHighlighted
                  ? 'color-mix(in srgb, var(--color-interactive) 12%, var(--color-surface))'
                  : 'var(--color-surface)',
              }}
            >
              {onColumnHeaderClick ? (
                <button
                  type="button"
                  onClick={() => onColumnHeaderClick(col.id)}
                  aria-label={`Ver turnos del ${col.fullLabel ?? col.label}`}
                  title={col.label}
                  className="turnero-header-btn"
                  style={{
                    display: 'block',
                    width: '100%',
                    fontSize: 12,
                    fontWeight: 600,
                    color: col.isHighlighted ? 'var(--color-interactive)' : 'var(--color-text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    margin: 0,
                    fontFamily: 'inherit',
                    lineHeight: 'inherit',
                    textAlign: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  {col.label}
                </button>
              ) : (
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: col.isHighlighted ? 'var(--color-interactive)' : 'var(--color-text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={col.label}
                >
                  {col.label}
                </div>
              )}
              {col.sublabel && (
                <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginTop: 1 }}>
                  {col.sublabel}
                </div>
              )}
            </div>
          ))}

          {/* Filas */}
          {hourRows.map((hour) => {
            const isNowRow = !!nowLine && nowLine.atHour === hour
            return (
              <Fragment key={`row-${hour}`}>
                <div
                  style={{
                    position: 'sticky',
                    left: 0,
                    zIndex: 2,
                    background: 'var(--color-bg)',
                    borderRight: '1px solid var(--color-border)',
                    borderBottom: '1px solid var(--color-border)',
                    borderTop: isNowRow ? `2px solid ${NOW_COLOR}` : undefined,
                    padding: '4px 6px',
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--color-text-secondary)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                  }}
                >
                  <span>{hour}</span>
                  {isNowRow && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: NOW_COLOR, lineHeight: 1 }}>
                      ahora
                    </span>
                  )}
                </div>
                {columns.map((col) => (
                  <GridCell
                    key={`cell-${col.id}-${hour}`}
                    cell={getCell(col.id, hour)}
                    columnId={col.id}
                    columnLabel={col.label}
                    hour={hour}
                    showProfessionalOnChip={showProfessionalOnChip}
                    isPast={isPastCell?.(col.id, hour) ?? false}
                    showNowLine={isNowRow && nowLine!.appliesToColumn(col.id)}
                    onAppointmentClick={onAppointmentClick}
                    onEmptyCellClick={onEmptyCellClick}
                    onColumnHeaderClick={onColumnHeaderClick}
                  />
                ))}
              </Fragment>
            )
          })}
        </div>
      </div>
    </>
  )
}
