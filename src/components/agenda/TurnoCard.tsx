'use client'

import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Appointment } from '@/types/appointments'
import { STATUS_LABELS } from '@/types/appointments'
import { StatusDot, statusToVariant } from '@/components/shared/StatusDot'

interface TurnoCardProps {
  appointment: Appointment
}

export function TurnoCard({ appointment }: TurnoCardProps) {
  const hora = format(parseISO(appointment.appointment_time), 'HH:mm', { locale: es })
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
      <div className="flex items-center gap-1.5 shrink-0">
        <StatusDot variant={variant} label={label} />
        <span className="text-xs text-[var(--color-text-secondary)]">{label}</span>
      </div>
    </div>
  )
}
