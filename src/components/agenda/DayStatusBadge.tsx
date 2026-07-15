'use client'

import { dayStatusBadge, type DayStatusTone } from '@/lib/agenda/day-status'
import type { DayStatusEntry } from '@/types/holidays'

// Badge "fácil" de decidir abre/no abre (pedido ISADI 2026-07-14). Se usa
// tanto en el encabezado de columna de la vista Semana como en el número de
// día de la vista Mes (`components.dateHeader` de react-big-calendar).
//
// - Día "especial" (feriado y/o con decisión de la clínica) → pastilla de
//   color con el texto de `dayStatusBadge` (rojo=cerrado, ámbar=feriado que
//   abre, verde=día normal reabierto a mano).
// - Día normal sin nada especial → un botón sutil (⋯) de baja prioridad
//   visual: sigue siendo POSIBLE cerrar cualquier día a mano (ej. corte de
//   agua), pero sin meter ruido en el 99% de los días.

const TONE_COLOR: Record<DayStatusTone, string> = {
  closed: 'var(--color-status-alert)',
  'holiday-open': 'var(--color-status-warn)',
  'open-override': 'var(--color-status-ok)',
}

interface DayStatusBadgeProps {
  entry: DayStatusEntry | undefined
  onClick: () => void
  /** Vista Mes: celdas más chicas → tipografía/padding reducidos. */
  compact?: boolean
}

export function DayStatusBadge({ entry, onClick, compact = false }: DayStatusBadgeProps) {
  const badge = dayStatusBadge(entry)

  if (!badge) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label="Día abierto. Click para cambiar el estado de este día."
        title="Cambiar estado del día"
        style={{
          fontSize: compact ? 10 : 11,
          color: 'var(--color-text-secondary)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: compact ? '0 2px' : '1px 4px',
          opacity: 0.55,
          lineHeight: 1,
        }}
      >
        ⋯
      </button>
    )
  }

  const color = TONE_COLOR[badge.tone]

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={badge.ariaLabel}
      title={badge.ariaLabel}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: compact ? 10 : 11,
        fontWeight: 700,
        color,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        border: `1px solid ${color}`,
        borderRadius: 4,
        padding: compact ? '1px 4px' : '2px 6px',
        lineHeight: 1.3,
        cursor: 'pointer',
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {badge.text}
    </button>
  )
}
