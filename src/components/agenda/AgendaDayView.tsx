'use client'

import type { Appointment } from '@/types/appointments'
import { TurnoCard } from './TurnoCard'

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

  if (appointments.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-[var(--color-text-secondary)]">
        Sin turnos para hoy
      </div>
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
