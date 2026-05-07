'use client'

import { useList } from '@refinedev/core'
import { startOfDay, endOfDay, formatISO, parseISO } from 'date-fns'
import type { Appointment } from '@/types/appointments'
import { TurnoCard } from './TurnoCard'

interface AgendaDayViewProps {
  date: string // ISO date YYYY-MM-DD
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
        <div
          key={i}
          className="h-11 rounded-[var(--radius-sm)] bg-[var(--color-surface)] animate-pulse"
        />
      ))}
    </div>
  )
}

export function AgendaDayView({ date }: AgendaDayViewProps) {
  const selectedDate = parseISO(date)
  const startISO = formatISO(startOfDay(selectedDate))
  const endISO = formatISO(endOfDay(selectedDate))

  const { query, result, overtime } = useList<Appointment>({
    resource: 'appointments',
    meta: {
      select: '*, patients(full_name), services(name, professional)',
    },
    filters: [
      { field: 'appointment_time', operator: 'gte', value: startISO },
      { field: 'appointment_time', operator: 'lte', value: endISO },
    ],
    sorters: [{ field: 'appointment_time', order: 'asc' }],
    pagination: { mode: 'off' },
    queryOptions: {
      queryKey: ['agenda', 'day', date],
      staleTime: 0,
    },
    overtimeOptions: { interval: 100 },
  })

  const timedOut = (overtime.elapsedTime ?? 0) >= 5000

  if (query.isPending && !timedOut) {
    return <AgendaDayViewSkeleton />
  }

  if (query.isError || timedOut) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 py-12 text-[var(--color-text-secondary)]"
      >
        <p className="text-sm">Error al cargar los turnos</p>
        <button
          onClick={() => query.refetch()}
          className="min-h-[44px] px-4 text-sm text-[var(--color-interactive)] hover:underline"
        >
          Reintentar
        </button>
      </div>
    )
  }

  const appointments = result.data as Appointment[]

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
              <TurnoCard key={apt.appointment_id} appointment={apt} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
