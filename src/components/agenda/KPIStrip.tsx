'use client'

import type { Appointment, AppointmentStatus } from '@/types/appointments'

interface KPIData {
  label: string
  value: number | '—'
}

interface KPIStripProps {
  appointments: Appointment[]
  isLoading: boolean
  isError: boolean
}

function computeKPIs(appointments: Appointment[]): KPIData[] {
  const count = (status: AppointmentStatus) =>
    appointments.filter((a) => a.status === status).length

  return [
    { label: 'Total', value: appointments.length },
    { label: 'Confirmados', value: count('confirmed') },
    { label: 'Cancelados', value: count('cancelled') },
    { label: 'No-shows', value: count('no_show') },
    { label: 'Pendientes', value: count('pending') },
  ]
}

export function KPIStripSkeleton() {
  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6"
      aria-label="Cargando KPIs del día"
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-2 p-4 min-h-[44px] rounded-[var(--radius-sm)] border border-[var(--color-border)] animate-pulse"
        >
          <div className="w-10 h-6 rounded bg-[var(--color-surface)]" />
          <div className="w-16 h-3 rounded bg-[var(--color-surface)]" />
        </div>
      ))}
    </div>
  )
}

export function KPIStrip({ appointments, isLoading, isError }: KPIStripProps) {
  if (isLoading) return <KPIStripSkeleton />

  const kpis: KPIData[] = isError
    ? [
        { label: 'Total', value: '—' },
        { label: 'Confirmados', value: '—' },
        { label: 'Cancelados', value: '—' },
        { label: 'No-shows', value: '—' },
        { label: 'Pendientes', value: '—' },
      ]
    : computeKPIs(appointments)

  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6"
      aria-label="KPIs del día"
      role="region"
    >
      {kpis.map(({ label, value }) => (
        <div
          key={label}
          className="flex flex-col p-4 min-h-[44px] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white"
        >
          <span className="text-2xl font-semibold text-[var(--color-text-primary)]">
            {value}
          </span>
          <span className="text-xs text-[var(--color-text-secondary)] mt-1">
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}
