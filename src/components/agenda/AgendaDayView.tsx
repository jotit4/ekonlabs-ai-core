'use client'

import type { Appointment } from '@/types/appointments'
import { TurnoCard } from './TurnoCard'
import { EmptyState } from '@/components/ui/empty-state'
import { CalendarOff } from 'lucide-react'

interface AgendaDayViewProps {
  date: string // ISO date YYYY-MM-DD (used for label/display context)
  appointments: Appointment[]
  isLoading: boolean
  isError: boolean
  onRefetch: () => void
  onReschedule?: (appointment: Appointment) => void
}

function groupByProfessional(appointments: Appointment[]): Map<string, Appointment[]> {
  const groups = new Map<string, Appointment[]>()
  for (const apt of appointments) {
    const key = apt.services?.professional ?? 'Sin profesional asignado'
    const group = groups.get(key) ?? []
    group.push(apt)
    groups.set(key, group)
  }
  return groups
}

export function AgendaDayViewSkeleton() {
  return (
    <div className="space-y-2" aria-label="Cargando turnos">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 min-h-[44px] animate-pulse">
          <div className="w-10 h-3 rounded bg-[var(--color-surface)] shrink-0" />
          <div className="flex-1 h-3 rounded bg-[var(--color-surface)]" />
          <div className="w-32 h-3 rounded bg-[var(--color-surface)]" />
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-[9px] h-[9px] rounded-full bg-[var(--color-surface)]" />
            <div className="w-16 h-3 rounded bg-[var(--color-surface)]" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function AgendaDayView({ appointments, isLoading, isError, onRefetch, onReschedule }: AgendaDayViewProps) {
  if (isLoading) {
    return <AgendaDayViewSkeleton />
  }

  if (isError) {
    return (
      <EmptyState
        icon={<CalendarOff className="h-6 w-6" />}
        title="No se pudieron cargar los turnos"
        description="Puede ser un problema temporal de conexión."
        action={{ label: 'Reintentar', onClick: onRefetch }}
      />
    )
  }

  if (appointments.length === 0) {
    return (
      <EmptyState
        icon={<CalendarOff className="h-6 w-6" />}
        title="Sin turnos para hoy"
        description="No hay turnos agendados para este día."
      />
    )
  }

  const groups = groupByProfessional(appointments)

  return (
    <div className="space-y-6">
      {Array.from(groups.entries()).map(([professional, apts]) => (
        <section key={professional} aria-label={professional}>
          <h3 className="px-4 pb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)] border-b border-[var(--color-border)]">
            {professional}
          </h3>
          <div className="divide-y divide-[var(--color-border)]">
            {apts.map((apt) => (
              <TurnoCard key={apt.appointment_id} appointment={apt} onReschedule={onReschedule} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
