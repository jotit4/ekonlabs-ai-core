'use client'

import { format, formatISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { CSSProperties, HTMLAttributes } from 'react'
import type { DayStatusEntry } from '@/types/holidays'
import { DayStatusBadge } from './DayStatusBadge'

// Vista Mes (react-big-calendar) — feriados + estado del día (pedido ISADI
// 2026-07-14). Se separan estas dos factories en su propio archivo (en vez de
// vivir inline en CalendarViewRangeReadOnly.tsx) para poder testear la lógica
// del badge/color SIN mockear react-big-calendar: se llama la factory y se
// renderiza/ejecuta el resultado directo con props de prueba.

interface MonthDateHeaderProps {
  label: string
  date: Date
  drilldownView: string | null
  isOffRange?: boolean
  onDrillDown: () => void
}

/**
 * Factory: crea el componente `components.dateHeader` de react-big-calendar
 * (vista Mes) con el badge de feriado/estado inyectado. RBC solo pasa
 * {label, date, drilldownView, isOffRange, onDrillDown} a este componente —
 * no hay forma de pasarle props extra directamente (no acepta children ni
 * props adicionales), por eso se arma con un closure que "cierra" sobre
 * `dayStatusMap`/`onDayStatusClick`/`onDayNumberClick`.
 *
 * El número del día es clickeable cuando `onDayNumberClick` está presente
 * (pedido ISADI 2026-07-14: abrir el modal con todos los turnos del día)
 * — tiene prioridad sobre el drilldown default de RBC, que en este calendario
 * nunca aplica en producción (`views={[Views.MONTH]}` sin vista Día
 * registrada → `drilldownView` siempre llega `null`). Se preserva igual el
 * comportamiento default de RBC (`onDrillDown`) como fallback para cuando
 * `onDayNumberClick` no se pasa, y como texto plano si tampoco hay drilldown.
 */
export function makeMonthDateHeader(
  dayStatusMap: Record<string, DayStatusEntry> | undefined,
  onDayStatusClick: ((date: string) => void) | undefined,
  onDayNumberClick?: (dateIso: string) => void,
) {
  return function MonthDateHeader({
    label,
    date,
    drilldownView,
    isOffRange = false,
    onDrillDown,
  }: MonthDateHeaderProps) {
    const dateIso = formatISO(date, { representation: 'date' })
    const entry = dayStatusMap?.[dateIso]
    const isClickable = !isOffRange && (!!onDayNumberClick || !!drilldownView)

    const handleClick = () => {
      if (isOffRange) return
      if (onDayNumberClick) {
        onDayNumberClick(dateIso)
      } else if (drilldownView) {
        onDrillDown()
      }
    }

    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, width: '100%' }}>
        {isClickable ? (
          <button
            type="button"
            className="rbc-button-link"
            onClick={handleClick}
            aria-label={`Ver turnos del ${format(date, 'EEEE d', { locale: es })}`}
          >
            {label}
          </button>
        ) : (
          <span>{label}</span>
        )}
        {!isOffRange && (
          <DayStatusBadge entry={entry} onClick={() => onDayStatusClick?.(dateIso)} compact />
        )}
      </div>
    )
  }
}

/**
 * Factory: crea el `dayPropGetter` de react-big-calendar (vista Mes) — tiñe
 * el fondo de la celda del día según el estado:
 * - CERRADO (feriado sin decisión "abre", o decisión explícita "no abre") →
 *   rayado rojizo tenue, para que un día cerrado se vea INEQUÍVOCAMENTE
 *   distinto de un día sin turnos (pedido explícito del cliente).
 * - "especial" pero efectivamente abierto (feriado reabierto a mano, o día
 *   normal reabierto tras haber estado cerrado) → tinte ámbar tenue, marca
 *   que el día tuvo una decisión sin gritar "cerrado".
 * - Día normal sin nada especial → `{}` (cero cambio visual).
 */
export function makeMonthDayPropGetter(
  dayStatusMap: Record<string, DayStatusEntry> | undefined,
): (date: Date) => HTMLAttributes<HTMLDivElement> {
  return (date: Date) => {
    if (!dayStatusMap) return {}
    const dateIso = formatISO(date, { representation: 'date' })
    const entry = dayStatusMap[dateIso]
    if (!entry) return {}

    const style: CSSProperties = entry.effectiveOpen
      ? { background: 'color-mix(in srgb, var(--color-status-warn) 8%, transparent)' }
      : {
          background:
            'repeating-linear-gradient(135deg, color-mix(in srgb, var(--color-status-alert) 10%, transparent), color-mix(in srgb, var(--color-status-alert) 10%, transparent) 6px, transparent 6px, transparent 12px)',
        }

    return { style }
  }
}
