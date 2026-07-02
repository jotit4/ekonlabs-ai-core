'use client'

import { useList } from '@refinedev/core'
import { useProfesionales } from '@/hooks/use-profesionales'
import { isRehabService } from '@/lib/agenda/service-visuals'
import type { Service } from '@/types/servicios'

// Modo de disponibilidad derivado de los filtros activos (professional_id →
// 'profesional', service_id → 'servicio', ninguno → 'ninguno'). Ya NO se expone
// como control de UI (el radiogroup "Ver disponibilidad de" fue eliminado por
// redundante con los dropdowns), pero AgendaView sigue usando el tipo para
// derivar `showProfessionalName`.
export type AvailabilityMode = 'ninguno' | 'profesional' | 'servicio'

// Foco del área visible en la agenda. Default = 'rehab' (rediseño foco
// rehabilitación): la clínica de rehab arranca viendo SOLO sus servicios.
export type AreaFocus = 'rehab' | 'todos'

interface AgendaFiltersProps {
  professionalId: string | null
  serviceId: string | null
  onProfessionalChange: (id: string | null) => void
  onServiceChange: (id: string | null) => void
  onClear: () => void
  showFilters: boolean
  // Rediseño foco rehabilitación — control "Rehabilitación | Ver todo" (opcional).
  // Default = 'rehab'. Solo afecta los servicios listados en el dropdown.
  areaFocus?: AreaFocus
  onAreaFocusChange?: (focus: AreaFocus) => void
}

export function AgendaFilters({
  professionalId,
  serviceId,
  onProfessionalChange,
  onServiceChange,
  onClear,
  showFilters,
  areaFocus = 'rehab',
  onAreaFocusChange,
}: AgendaFiltersProps) {
  const { profesionales } = useProfesionales()

  const { result: serviciosResult } = useList<Service>({
    resource: 'services',
    meta: { select: 'service_id, name' },
    sorters: [{ field: 'name', order: 'asc' }],
    pagination: { mode: 'off' },
    filters: [{ field: 'active', operator: 'eq', value: true }],
  })

  const allServicios = serviciosResult?.data ?? []
  // Foco rehabilitación: cuando areaFocus='rehab' solo se ofrecen los servicios
  // del área de rehabilitación (heurística por nombre centralizada en
  // service-visuals). 'todos' muestra el catálogo completo.
  const servicios =
    areaFocus === 'rehab' ? allServicios.filter((s) => isRehabService(s.name)) : allServicios

  const hasFilters = professionalId !== null || serviceId !== null

  if (!showFilters) return null

  const showAreaFocus = !!onAreaFocusChange

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2" role="group" aria-label="Filtros de agenda">
      {showAreaFocus && (
        <div
          role="radiogroup"
          aria-label="Área de la agenda"
          className="flex items-center gap-2 flex-wrap"
        >
          <span className="text-sm text-[var(--color-text-secondary)] whitespace-nowrap">
            Área
          </span>
          {([
            { value: 'rehab', label: 'Rehabilitación' },
            { value: 'todos', label: 'Ver todo' },
          ] as const).map((opt) => {
            const selected = areaFocus === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onAreaFocusChange?.(opt.value)}
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
