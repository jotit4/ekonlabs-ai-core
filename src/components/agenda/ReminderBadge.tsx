'use client'

import { format, parseISO, isValid } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  reminderState,
  REMINDER_STATE_LABELS,
  type ReminderState,
} from '@/types/appointments'

// Reusa la paleta de StatusDot: verde = active, ámbar = warning.
const VARIANT_COLOR: Record<Exclude<ReminderState, 'none'>, string> = {
  confirmed: '#34c759', // active
  unconfirmed: '#ff9f0a', // warning
}

interface ReminderBadgeProps {
  reminderSentAt: string | null
  attendanceConfirmed: boolean | null
}

/**
 * Indicador de solo lectura del estado del recordatorio de WhatsApp.
 * - 'confirmed'   → badge verde "Confirmado por el paciente"
 * - 'unconfirmed' → badge ámbar "Sin confirmar · HH:mm" (hora de envío)
 * - 'none'        → no renderiza nada (AC4: sin ruido visual)
 */
export function ReminderBadge({
  reminderSentAt,
  attendanceConfirmed,
}: ReminderBadgeProps) {
  const state = reminderState({
    reminder_sent_at: reminderSentAt,
    attendance_confirmed: attendanceConfirmed,
  })

  if (state === 'none') return null

  const label = REMINDER_STATE_LABELS[state]
  const color = VARIANT_COLOR[state]

  // Hora de envío sólo para 'unconfirmed' (AC1), con guarda de fecha inválida (AC6).
  let sentLabel: string | null = null
  if (state === 'unconfirmed' && reminderSentAt) {
    const parsed = parseISO(reminderSentAt)
    if (isValid(parsed)) {
      sentLabel = format(parsed, "dd/MM HH:mm", { locale: es })
    }
  }

  const ariaLabel = sentLabel
    ? `Estado de recordatorio: ${label}, enviado ${sentLabel}`
    : `Estado de recordatorio: ${label}`

  return (
    <span
      aria-label={ariaLabel}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        color: 'var(--color-text-secondary)',
      }}
    >
      <span
        role="img"
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: 9,
          height: 9,
          borderRadius: '50%',
          backgroundColor: color,
          flexShrink: 0,
        }}
      />
      <span>
        {label}
        {sentLabel ? ` · ${sentLabel}` : ''}
      </span>
    </span>
  )
}
