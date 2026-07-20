'use client'

import { useList } from '@refinedev/core'
import { useProfesionales } from '@/hooks/use-profesionales'
import type { Service } from '@/types/servicios'

// Foco del área visible en la agenda. Default = 'rehab' (rediseño foco
// rehabilitación): la clínica de rehab arranca viendo SOLO sus servicios.
// El toggle "Rehabilitación | Ver todo" se retiró de la UI (decisión ISADI
// dueño 2026-07-16 — la agenda es 100% modo grupos), pero el tipo se conserva
// porque AgendaView sigue usándolo para el recorte por defecto a rehab.
export type AreaFocus = 'rehab' | 'todos'

// ─── Botones de GRUPO (decisión ISADI 2026-07-16) ─────────────────────────────

// La agenda se filtra por 3 botones de GRUPO — uno por cada
// `services.reception_group` no nulo presente (Fisioterapia / Pileta /
// Pilates). Es el ÚNICO modo de filtrado por servicio para TODOS los roles de
// /agenda (admin y recepción) — el dueño pidió "igual que recepción". Orden
// fijo (no alfabético) — coincide con el orden en que el cliente los nombró.
// `hint` es SOLO etiqueta (texto), sin lógica de cupos.
const RECEPTION_GROUPS: { value: string; label: string; hint?: string }[] = [
  { value: 'fisioterapia', label: 'Fisioterapia' },
  { value: 'pileta', label: 'Pileta' },
  { value: 'pilates', label: 'Pilates' },
]

interface AgendaServiceButtonsProps {
  // Grupo de recepción seleccionado (Fisioterapia/Pileta/Pilates) — estado
  // controlado. `null` = ningún grupo elegido (agenda sin recorte por grupo).
  receptionGroup: string | null
  onReceptionGroupChange: (group: string | null) => void
}

/**
 * Botones toggle de GRUPO: reemplazan el <select> de Servicio por una fila de
 * botones de grupo — un toque para filtrar la agenda, sin abrir un dropdown.
 * Tocar el grupo ya activo lo deselecciona (vuelve a "todos").
 *
 * Decisión ISADI 2026-07-16 (dueño, rol admin): la agenda muestra los 3
 * botones de GRUPO (Fisioterapia/Pileta/Pilates) para TODOS los roles — "igual
 * que recepción". Antes admin veía un botón por servicio individual; ese modo
 * se eliminó. Se renderiza SIEMPRE visible (recepción y admin): es la forma
 * principal de navegar la agenda, no un control secundario a esconder detrás de
 * "Filtrar" (a diferencia de <AgendaFilters>, que sí queda plegada para
 * recepción).
 *
 * Se ofrece un botón por cada `reception_group` no nulo presente en el catálogo
 * de servicios activos — ver RECEPTION_GROUPS arriba.
 */
export function AgendaServiceButtons({
  receptionGroup,
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
            onClick={() => onReceptionGroupChange(selected ? null : g.value)}
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

// ─── Resto de filtros: Profesional, Limpiar ───────────────────────────────────

interface AgendaFiltersProps {
  professionalId: string | null
  // Solo se usa para el estado habilitado/deshabilitado de "Limpiar" (el
  // control de Servicio en sí vive en <AgendaServiceButtons>, siempre visible).
  serviceId: string | null
  onProfessionalChange: (id: string | null) => void
  onClear: () => void
  showFilters: boolean
  // Deuda detectada Frente B — el grupo (Fisioterapia/Pileta/Pilates, ver
  // AgendaServiceButtons) vive como estado de AgendaView y no se le pasaba a
  // este componente, así que "Limpiar" quedaba deshabilitado cuando el ÚNICO
  // filtro activo era el grupo (sin service_id/professional_id). Solo se usa
  // para el estado de `hasFilters` — el reset del grupo en sí lo sigue haciendo
  // el `onClear` de AgendaView.
  hasReceptionGroup?: boolean
}

export function AgendaFilters({
  professionalId,
  serviceId,
  onProfessionalChange,
  onClear,
  showFilters,
  hasReceptionGroup = false,
}: AgendaFiltersProps) {
  const { profesionales } = useProfesionales()

  const hasFilters = professionalId !== null || serviceId !== null || hasReceptionGroup

  if (!showFilters) return null

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2" role="group" aria-label="Filtros de agenda">
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
