'use client'

import { useList } from '@refinedev/core'
import { useProfesionales } from '@/hooks/use-profesionales'
import type { Service } from '@/types/servicios'

interface AgendaFiltersProps {
  professionalId: string | null
  serviceId: string | null
  onProfessionalChange: (id: string | null) => void
  onServiceChange: (id: string | null) => void
  onClear: () => void
  showFilters: boolean
}

export function AgendaFilters({
  professionalId,
  serviceId,
  onProfessionalChange,
  onServiceChange,
  onClear,
  showFilters,
}: AgendaFiltersProps) {
  const { profesionales } = useProfesionales()

  const { result: serviciosResult } = useList<Service>({
    resource: 'services',
    meta: { select: 'service_id, name' },
    sorters: [{ field: 'name', order: 'asc' }],
    pagination: { mode: 'off' },
    filters: [{ field: 'active', operator: 'eq', value: true }],
  })

  const servicios = serviciosResult?.data ?? []

  const hasFilters = professionalId !== null || serviceId !== null

  if (!showFilters) return null

  return (
    <div className="flex items-center gap-3 flex-wrap" role="group" aria-label="Filtros de agenda">
      <div className="flex items-center gap-2">
        <label
          htmlFor="agenda-filter-professional"
          className="text-sm text-[var(--color-text-secondary)] whitespace-nowrap"
        >
          Profesional
        </label>
        <select
          id="agenda-filter-professional"
          value={professionalId ?? ''}
          onChange={(e) => onProfessionalChange(e.target.value || null)}
          className="min-h-[36px] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]"
          aria-label="Filtrar por profesional"
        >
          <option value="">Todos los profesionales</option>
          {profesionales.map((p) => (
            <option key={p.professional_id} value={p.professional_id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label
          htmlFor="agenda-filter-service"
          className="text-sm text-[var(--color-text-secondary)] whitespace-nowrap"
        >
          Servicio
        </label>
        <select
          id="agenda-filter-service"
          value={serviceId ?? ''}
          onChange={(e) => onServiceChange(e.target.value || null)}
          className="min-h-[36px] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]"
          aria-label="Filtrar por servicio"
        >
          <option value="">Todos los servicios</option>
          {servicios.map((s) => (
            <option key={s.service_id} value={s.service_id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={onClear}
        disabled={!hasFilters}
        className="min-h-[36px] px-3 text-sm rounded-[var(--radius-sm)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Limpiar filtros"
      >
        Limpiar
      </button>
    </div>
  )
}
