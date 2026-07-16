'use client'

import { useList } from '@refinedev/core'
import { useProfesionales } from '@/hooks/use-profesionales'
import { isRehabService } from '@/lib/agenda/service-visuals'
import type { Service } from '@/types/servicios'

// Foco del área visible en la agenda. Default = 'rehab' (rediseño foco
// rehabilitación): la clínica de rehab arranca viendo SOLO sus servicios.
export type AreaFocus = 'rehab' | 'todos'

// ─── Botones de Servicio (pedido ISADI 2026-07-14) ────────────────────────────

// Pedido 2 (ISADI 2026-07-16) — recepción ve 3 botones de GRUPO en vez de un
// botón por servicio: uno por cada `services.reception_group` no nulo
// presente (Fisioterapia / Pileta / Pilates). Orden fijo (no alfabético) —
// coincide con el orden en que el cliente los nombró. `hint` es SOLO
// etiqueta (texto), sin lógica de cupos.
const RECEPTION_GROUPS: { value: string; label: string; hint?: string }[] = [
  { value: 'fisioterapia', label: 'Fisioterapia' },
  { value: 'pileta', label: 'Pileta' },
  { value: 'pilates', label: 'Pilates' },
]

interface AgendaServiceButtonsProps {
  serviceId: string | null
  onServiceChange: (id: string | null) => void
  // Rediseño foco rehabilitación — recorta el catálogo ofrecido, mismo criterio
  // que el resto de los controles de agenda. Default = 'rehab'. Sin efecto
  // cuando `isReceptionist` (ese modo tiene su propio agrupador).
  areaFocus?: AreaFocus
  // Pedido 2 (ISADI 2026-07-16) — cuando es true, el componente renderiza los
  // 3 botones de GRUPO (Fisioterapia/Pileta/Pilates) en vez de un botón por
  // servicio. `receptionGroup`/`onReceptionGroupChange` son el estado
  // controlado de ESE modo (independiente de `serviceId`/`onServiceChange`,
  // que siguen intactos para admin/doctor).
  isReceptionist?: boolean
  receptionGroup?: string | null
  onReceptionGroupChange?: (group: string | null) => void
}

/**
 * Botones toggle de Servicio: reemplazan el <select> de Servicio por una fila
 * de botones — un toque para filtrar la agenda, sin abrir un dropdown. Tocar
 * el servicio ya activo lo deselecciona (vuelve a "todos"). Se renderiza
 * SIEMPRE visible (recepción y admin): es la forma principal de navegar la
 * agenda por servicio, no un control secundario a esconder detrás de
 * "Filtrar" (a diferencia de <AgendaFilters>, que sí queda plegada para
 * recepción).
 *
 * Para `isReceptionist=true` (Pedido 2 ISADI 2026-07-16) el criterio cambia:
 * en vez de un botón por servicio activo, se ofrecen 3 botones de GRUPO
 * (Fisioterapia/Pileta/Pilates) — ver RECEPTION_GROUPS arriba.
 */
export function AgendaServiceButtons({
  serviceId,
  onServiceChange,
  areaFocus = 'rehab',
  isReceptionist = false,
  receptionGroup = null,
  onReceptionGroupChange,
}: AgendaServiceButtonsProps) {
  const { result: serviciosResult } = useList<Service>({
    resource: 'services',
    meta: { select: 'service_id, name, reception_group' },
    sorters: [{ field: 'name', order: 'asc' }],
    pagination: { mode: 'off' },
    filters: [{ field: 'active', operator: 'eq', value: true }],
  })

  const allServicios = serviciosResult?.data ?? []

  if (isReceptionist) {
    const presentGroups = new Set(
      allServicios.map((s) => s.reception_group).filter((g): g is string => !!g),
    )
    const groups = RECEPTION_GROUPS.filter((g) => presentGroups.has(g.value))

    if (groups.length === 0) return null

    return (
      <div
        role="group"
        aria-label="Filtrar por grupo"
        className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 sm:flex-wrap sm:overflow-visible sm:mx-0 sm:px-0 sm:pb-0"
      >
        {groups.map((g) => {
          const selected = receptionGroup === g.value
          return (
            <button
              key={g.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onReceptionGroupChange?.(selected ? null : g.value)}
              className={[
                'shrink-0 min-h-[44px] px-4 rounded-[var(--radius-sm)] border text-sm font-medium whitespace-nowrap transition-colors',
                selected
                  ? 'border-[var(--color-interactive)] bg-[var(--color-interactive)] text-white'
                  : 'border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface)]',
              ].join(' ')}
            >
              {g.label}
              {g.hint ? ` · ${g.hint}` : ''}
            </button>
          )
        })}
      </div>
    )
  }

  // Foco rehabilitación: cuando areaFocus='rehab' solo se ofrecen los servicios
  // del área de rehabilitación (heurística por nombre centralizada en
  // service-visuals). 'todos' muestra el catálogo completo.
  const servicios =
    areaFocus === 'rehab' ? allServicios.filter((s) => isRehabService(s.name)) : allServicios

  if (servicios.length === 0) return null

  return (
    <div
      role="group"
      aria-label="Filtrar por servicio"
      // Mobile-first: fila con scroll horizontal (un servicio no se corta, la
      // página no se desborda). Desde `sm:` en adelante hay lugar de sobra →
      // se envuelve (flex-wrap) en vez de scrollear.
      className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 sm:flex-wrap sm:overflow-visible sm:mx-0 sm:px-0 sm:pb-0"
    >
      {servicios.map((s) => {
        const selected = serviceId === s.service_id
        return (
          <button
            key={s.service_id}
            type="button"
            aria-pressed={selected}
            onClick={() => onServiceChange(selected ? null : s.service_id)}
            className={[
              'shrink-0 min-h-[44px] px-4 rounded-[var(--radius-sm)] border text-sm font-medium whitespace-nowrap transition-colors',
              selected
                ? 'border-[var(--color-interactive)] bg-[var(--color-interactive)] text-white'
                : 'border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface)]',
            ].join(' ')}
          >
            {s.name}
          </button>
        )
      })}
    </div>
  )
}

// ─── Resto de filtros: Profesional, Área, Limpiar ─────────────────────────────

interface AgendaFiltersProps {
  professionalId: string | null
  // Solo se usa para el estado habilitado/deshabilitado de "Limpiar" (el
  // control de Servicio en sí vive en <AgendaServiceButtons>, siempre visible).
  serviceId: string | null
  onProfessionalChange: (id: string | null) => void
  onClear: () => void
  showFilters: boolean
  // Rediseño foco rehabilitación — control "Rehabilitación | Ver todo" (opcional).
  // Default = 'rehab'. Solo afecta los servicios listados en AgendaServiceButtons.
  areaFocus?: AreaFocus
  onAreaFocusChange?: (focus: AreaFocus) => void
}

export function AgendaFilters({
  professionalId,
  serviceId,
  onProfessionalChange,
  onClear,
  showFilters,
  areaFocus = 'rehab',
  onAreaFocusChange,
}: AgendaFiltersProps) {
  const { profesionales } = useProfesionales()

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
