'use client'

import { useList } from '@refinedev/core'
import { useProfesionales } from '@/hooks/use-profesionales'
import type { Service } from '@/types/servicios'

export type AvailabilityMode = 'ninguno' | 'profesional' | 'servicio'

interface AgendaFiltersProps {
  professionalId: string | null
  serviceId: string | null
  onProfessionalChange: (id: string | null) => void
  onServiceChange: (id: string | null) => void
  onClear: () => void
  showFilters: boolean
  // Story 10.7 — modo de disponibilidad "Ver disponibilidad de" (opcional)
  availabilityMode?: AvailabilityMode
  onAvailabilityModeChange?: (mode: AvailabilityMode) => void
}

export function AgendaFilters({
  professionalId,
  serviceId,
  onProfessionalChange,
  onServiceChange,
  onClear,
  showFilters,
  availabilityMode = 'ninguno',
  onAvailabilityModeChange,
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

  // Cambiar de modo limpia la selección del otro eje para garantizar exclusión
  // mutua (nunca se mandan professional_id y service_id a la vez).
  function handleModeChange(mode: AvailabilityMode) {
    if (mode === 'profesional') {
      onServiceChange(null)
    } else if (mode === 'servicio') {
      onProfessionalChange(null)
    } else {
      onProfessionalChange(null)
      onServiceChange(null)
    }
    onAvailabilityModeChange?.(mode)
  }

  if (!showFilters) return null

  const showAvailabilityMode = !!onAvailabilityModeChange

  return (
    <div className="flex flex-col gap-3" role="group" aria-label="Filtros de agenda">
      {showAvailabilityMode && (
        <div
          role="radiogroup"
          aria-label="Ver disponibilidad de"
          className="flex items-center gap-2 flex-wrap"
        >
          <span className="text-sm text-[var(--color-text-secondary)] whitespace-nowrap">
            Ver disponibilidad de
          </span>
          {([
            { value: 'ninguno', label: 'Todos' },
            { value: 'profesional', label: 'Por profesional' },
            { value: 'servicio', label: 'Por servicio' },
          ] as const).map((opt) => {
            const selected = availabilityMode === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => handleModeChange(opt.value)}
                className={[
                  'min-h-[36px] px-3 text-sm rounded-[var(--radius-sm)] border transition-colors',
                  selected
                    ? 'border-[var(--color-interactive)] bg-[var(--color-interactive)] text-white'
                    : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]',
                ].join(' ')}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
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
    </div>
  )
}
