'use client'

import { format, parseISO, isValid } from 'date-fns'
import { es } from 'date-fns/locale'
import { Pencil } from 'lucide-react'
import type { Appointment } from '@/types/appointments'
import { STATUS_LABELS } from '@/types/appointments'
import { StatusDot, statusToVariant } from '@/components/shared/StatusDot'
import { ReminderBadge } from './ReminderBadge'

interface TurnoCardProps {
  appointment: Appointment
  onReschedule?: (appointment: Appointment) => void // prop opcional para accesibilidad alternativa
}

export function TurnoCard({ appointment, onReschedule }: TurnoCardProps) {
  // Usar start_at como fuente de verdad; fallback a appointment_time (legacy)
  const timeSource = appointment.start_at ?? appointment.appointment_time ?? ''
  const parsedTime = parseISO(timeSource)
  const hora = isValid(parsedTime) ? format(parsedTime, 'HH:mm', { locale: es }) : '--:--'
  const paciente = appointment.patients?.full_name ?? 'Paciente desconocido'
  const servicio = appointment.services?.name ?? ''
  const profesional = appointment.services?.professional
  const label = STATUS_LABELS[appointment.status]
  const variant = statusToVariant(appointment.status)

  return (
    <div className="flex items-center gap-3 px-4 py-3 min-h-[44px]">
      <span className="w-10 shrink-0 text-sm font-mono text-[var(--color-text-secondary)]">
        {hora}
      </span>
      <span className="flex-1 text-sm font-medium text-[var(--color-text-primary)] truncate">
        {paciente}
      </span>
      <span className="text-sm text-[var(--color-text-secondary)] truncate">
        {servicio}
        {profesional ? ` · ${profesional}` : ''}
      </span>
      <ReminderBadge
        reminderSentAt={appointment.reminder_sent_at}
        attendanceConfirmed={appointment.attendance_confirmed}
      />
      <div className="flex items-center gap-1.5 shrink-0">
        <StatusDot variant={variant} label={label} />
        <span className="text-xs text-[var(--color-text-secondary)]">{label}</span>
      </div>
      {onReschedule && (
        <button
          type="button"
          onClick={() => onReschedule(appointment)}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-secondary)] hover:text-[var(--color-interactive)] hover:bg-[var(--color-surface)] transition-colors"
          aria-label={`Reprogramar turno de ${appointment.patients?.full_name ?? 'paciente'}`}
        >
          <Pencil className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
