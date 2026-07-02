'use client'

import { Fragment } from 'react'
import { type Appointment, STATUS_LABELS } from '@/types/appointments'
import type { AvailabilityShift } from '@/types/availability'
import { getStatusColor } from '@/lib/agenda/status-colors'
import {
  hhmmFromDate,
  type TurneroColumn,
  type TurneroCell,
} from '@/lib/agenda/turnero-grid'
import { StatusDot, statusToVariant } from '@/components/shared/StatusDot'
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
  onFreeSlotClick?: (shift: AvailabilityShift) => void
  /** En vista Semana el chip muestra el profesional (la columna es un día). */
  showProfessionalOnChip?: boolean
  /** ¿La celda (columna, hora) es una hora ya pasada de hoy? → se atenúa. */
  isPastCell?: (columnId: string, hour: string) => boolean
  /** Línea de "ahora": se dibuja sobre la fila `atHour` en las columnas que matchean. */
  nowLine?: { atHour: string; appliesToColumn: (columnId: string) => boolean }
  /**
   * La disponibilidad ("N libres") aún se está cargando (RPC pesada, 2-3s). Mientras
   * es true, las celdas dentro del horario, sin turno y sin huecos todavía muestran un
   * skeleton tenue ("buscando horarios") en vez de quedar vacías y llenarse de golpe.
   */
  availabilityLoading?: boolean
  ariaLabel?: string
}

// Con más de esta cantidad de huecos en una celda — o cuando la celda YA tiene
// un turno — se colapsan a un contador discreto ("N libres") en vez de listar
// cada uno. Evita el ruido de "10:00" repetido y que una celda cargada agrande
// toda su fila (las filas de la grilla comparten alto).
const MAX_INLINE_FREE = 1

const HOUR_COL_WIDTH = 60
const ROW_MIN_HEIGHT = 56
// Color de la línea de "ahora" (patrón calendario). Rojo reconocible.
const NOW_COLOR = '#ef4444'

// ─── Chip de turno ocupado ────────────────────────────────────────────────────

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
  const color = getStatusColor(status)
  const isCancelled = status === 'cancelled'
  const patientName = apt.patients?.full_name ?? 'Paciente'
  const serviceName = apt.services?.name ?? null
  const profName = professionalNameOf(apt)
  const exactTime = hhmmFromDate(new Date(apt.start_at))
  // Mostrar la hora en el chip solo cuando difiere del inicio de la fila
  // (ej. un turno a las 09:30 dentro de la fila 09:00). Si coincide, la
  // columna HORA ya la ancla → no se repite (planilla limpia).
  const showTime = exactTime !== rowHour

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
        background: `${color}1a`,
        border: 'none',
        borderLeft: `3px solid ${color}`,
        borderRadius: '0 6px 6px 0',
        padding: '4px 6px',
        cursor: onClick ? 'pointer' : 'default',
        opacity: isCancelled ? 0.55 : 1,
        transition: 'background 0.12s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = `${color}2e` }}
      onMouseLeave={(e) => { e.currentTarget.style.background = `${color}1a` }}
    >
      {showTime && (
        <span style={{ fontSize: 10, fontWeight: 700, color, lineHeight: 1.2 }}>
          {exactTime}
        </span>
      )}
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--color-text-primary)',
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
            color: 'var(--color-text-secondary)',
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
        <StatusDot variant={statusToVariant(status)} label={STATUS_LABELS[status]} />
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

// ─── Hueco libre individual ───────────────────────────────────────────────────

function FreeSlotButton({
  shift,
  onClick,
}: {
  shift: AvailabilityShift
  onClick?: (shift: AvailabilityShift) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(shift)}
      aria-label={`Agendar a las ${shift.open} con ${shift.professional_name}`}
      title={`Agendar a las ${shift.open}${shift.service_name ? ` · ${shift.service_name}` : ''}`}
      className="turnero-free-slot"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        width: '100%',
        minHeight: 26,
        background: 'transparent',
        border: '1px dashed transparent',
        borderRadius: 6,
        cursor: 'pointer',
        color: 'var(--color-text-secondary)',
        transition: 'background 0.12s, border-color 0.12s, opacity 0.12s',
      }}
    >
      <span aria-hidden="true" className="turnero-free-plus" style={{ fontSize: 15, fontWeight: 400, lineHeight: 1, opacity: 0 }}>
        +
      </span>
      <span style={{ fontSize: 10, opacity: 0.7 }}>{shift.open}</span>
    </button>
  )
}

// ─── Hueco colapsado ("N libres") ─────────────────────────────────────────────

function FreeCountButton({
  count,
  hour,
  shifts,
  onClick,
}: {
  count: number
  hour: string
  shifts: AvailabilityShift[]
  onClick?: (shift: AvailabilityShift) => void
}) {
  const first = shifts[0]
  return (
    <button
      type="button"
      onClick={() => first && onClick?.(first)}
      aria-label={count === 1 ? `1 horario libre a las ${hour}` : `${count} horarios libres a las ${hour}`}
      className="turnero-free-slot"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        minHeight: 26,
        background: 'transparent',
        border: '1px dashed transparent',
        borderRadius: 6,
        cursor: 'pointer',
        color: 'var(--color-text-secondary)',
        fontSize: 11,
        transition: 'background 0.12s, border-color 0.12s',
      }}
    >
      {count === 1 ? '1 libre' : `${count} libres`}
    </button>
  )
}

// ─── Celda ────────────────────────────────────────────────────────────────────

function GridCell({
  cell,
  hour,
  showProfessionalOnChip,
  isPast = false,
  showNowLine = false,
  availabilityLoading = false,
  onAppointmentClick,
  onFreeSlotClick,
}: {
  cell: TurneroCell
  hour: string
  showProfessionalOnChip?: boolean
  isPast?: boolean
  showNowLine?: boolean
  availabilityLoading?: boolean
  onAppointmentClick?: (apt: Appointment) => void
  onFreeSlotClick?: (shift: AvailabilityShift) => void
}) {
  const { appointments, freeShifts, outOfHours } = cell
  const hasAppointments = appointments.length > 0
  const hasFree = freeShifts.length > 0
  const isEmpty = !hasAppointments && !hasFree
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

  // Hueco dentro del horario, sin turno y sin huecos. Dos casos:
  //  - La disponibilidad todavía se está cargando → skeleton tenue: comunica
  //    "buscando horarios" y reserva el alto donde luego irían los "libres",
  //    evitando el salto visual de llenarse de golpe.
  //  - Ya cargó y no hay hueco real que ofrecer → gap muy sutil, no clickeable.
  if (isEmpty) {
    if (availabilityLoading) {
      return (
        <div
          aria-hidden="true"
          style={{
            minHeight: ROW_MIN_HEIGHT,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 3,
            borderRight: '1px solid var(--color-border)',
            borderBottom: '1px solid var(--color-border)',
            borderTop: nowBorder,
            background: 'var(--color-bg)',
          }}
        >
          <span
            data-testid="turnero-cell-skeleton"
            className="turnero-skeleton"
            style={{ width: '64%', height: 22, borderRadius: 6 }}
          />
        </div>
      )
    }
    return (
      <div
        style={{
          minHeight: ROW_MIN_HEIGHT,
          borderRight: '1px solid var(--color-border)',
          borderBottom: '1px solid var(--color-border)',
          borderTop: nowBorder,
          background: 'var(--color-bg)',
        }}
      />
    )
  }

  // Colapsar a "N libres" cuando la celda ya tiene un turno (para no inflar su
  // alto) o cuando hay más de un hueco (varios profesionales a la misma hora →
  // listarlos como "10:00" repetido no aporta). Solo se listan individualmente
  // los huecos cuando la celda no tiene turno y hay exactamente uno.
  const collapseFree = hasAppointments || freeShifts.length > MAX_INLINE_FREE

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
      {appointments.map((apt) => (
        <TurnoChip
          key={apt.appointment_id}
          apt={apt}
          rowHour={hour}
          showProfessional={showProfessionalOnChip}
          onClick={onAppointmentClick}
        />
      ))}

      {/* En horas pasadas no se ofrecen huecos para agendar. */}
      {hasFree && !isPast && collapseFree && (
        <FreeCountButton
          count={freeShifts.length}
          hour={hour}
          shifts={freeShifts}
          onClick={onFreeSlotClick}
        />
      )}

      {hasFree && !isPast && !collapseFree &&
        freeShifts.map((shift, idx) => (
          <FreeSlotButton
            key={`free-${shift.slot_start_iso}-${shift.professional_id}-${shift.service_id}-${idx}`}
            shift={shift}
            onClick={onFreeSlotClick}
          />
        ))}
    </div>
  )
}

// ─── Grilla ───────────────────────────────────────────────────────────────────

export function TurneroGrid({
  columns,
  hourRows,
  getCell,
  onAppointmentClick,
  onFreeSlotClick,
  showProfessionalOnChip,
  isPastCell,
  nowLine,
  availabilityLoading = false,
  ariaLabel = 'Grilla de turnos',
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
      {/* Estilos de interacción para huecos libres (hover → aparece el "+") y
          skeleton de disponibilidad (barra gris tenue con pulso). El pulso lo
          neutraliza el prefers-reduced-motion global de globals.css. */}
      <style>{`
        .turnero-free-slot:hover {
          background: var(--color-surface);
          border-color: var(--color-border);
        }
        .turnero-free-slot:hover .turnero-free-plus { opacity: 0.6 !important; }
        .turnero-free-slot:focus-visible {
          outline: 2px solid var(--color-interactive);
          outline-offset: -2px;
        }
        @keyframes turnero-skeleton-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.75; }
        }
        .turnero-skeleton {
          display: block;
          background: var(--color-border);
          animation: turnero-skeleton-pulse 1.4s ease-in-out infinite;
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
                    hour={hour}
                    showProfessionalOnChip={showProfessionalOnChip}
                    isPast={isPastCell?.(col.id, hour) ?? false}
                    showNowLine={isNowRow && nowLine!.appliesToColumn(col.id)}
                    availabilityLoading={availabilityLoading}
                    onAppointmentClick={onAppointmentClick}
                    onFreeSlotClick={onFreeSlotClick}
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
