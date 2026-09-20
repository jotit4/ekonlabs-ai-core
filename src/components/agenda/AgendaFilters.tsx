'use client'

import { useList } from '@refinedev/core'
import { useProfesionales } from '@/hooks/use-profesionales'
import { useTenantConfig } from '@/hooks/use-tenant-config'
import { resolveGroupLabel, sortGroupKeys } from '@/lib/agenda/reception-groups'
import type { Service } from '@/types/servicios'

// Foco del área visible en la agenda. 'rehab' recorta la agenda a servicios
// de rehabilitación (heurística por nombre, ver service-visuals.ts) — SOLO
// para el tenant que lo configuró en `tenants.rules.agenda_area_focus` (ISADI,
// migración 062; ver AgendaView). Antes era un default universal: cualquier
// tenant sin servicios de rehab veía la agenda vacía — bug corregido.
// El toggle "Rehabilitación | Ver todo" se retiró de la UI (decisión ISADI
// dueño 2026-07-16 — la agenda es 100% modo grupos), pero el tipo se conserva
// porque AgendaView sigue usándolo para el recorte.
export type AreaFocus = 'rehab' | 'todos'

// ─── Botones de GRUPO (decisión ISADI 2026-07-16) ─────────────────────────────

// La agenda se filtra por botones de GRUPO — uno por cada
// `services.reception_group` (migración 053) no nulo presente en el catálogo
// de servicios activos. Es el ÚNICO modo de filtrado por servicio para TODOS
// los roles de /agenda (admin y recepción) — el dueño pidió "igual que
// recepción". Antes la lista de grupos válidos (y su etiqueta visible) era un
// array fijo en el código (solo fisioterapia/pileta/pilates) — una cuenta que
// etiquetara sus servicios con otro grupo no veía ningún botón. Ahora los
// grupos salen de los servicios activos y la etiqueta de
// `tenants.rules.reception_groups` (migración 069, vía useTenantConfig) —
// dato de la cuenta, no un nombre fijo. El orden sale de
// `reception_groups[grupo].order` (ver sortGroupKeys); los grupos sin `order`
// van después, en orden de aparición entre los servicios activos.
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
 * Se ofrece un botón por cada `reception_group` no nulo presente en el
 * catálogo de servicios activos — ver comentario arriba de
 * `AgendaServiceButtonsProps`. La etiqueta visible sale de
 * `tenants.rules.reception_groups` (useTenantConfig) o, si la cuenta no la
 * configuró, de la clave con la primera letra en mayúscula.
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
  const { receptionGroups, isPending: tenantConfigPending } = useTenantConfig()

  const allServicios = serviciosResult?.data ?? []

  // Grupos presentes entre los servicios activos, en orden de primera
  // aparición (los servicios ya vienen ordenados por nombre — `sorters`
  // arriba). Reemplaza el array fijo que solo conocía fisioterapia/pileta/
  // pilates.
  const presentGroupKeys: string[] = []
  const seenGroupKeys = new Set<string>()
  for (const s of allServicios) {
    if (s.reception_group && !seenGroupKeys.has(s.reception_group)) {
      seenGroupKeys.add(s.reception_group)
      presentGroupKeys.push(s.reception_group)
    }
  }
  const groups = sortGroupKeys(presentGroupKeys, receptionGroups).map((value) => ({
    value,
    label: resolveGroupLabel(value, receptionGroups),
  }))

  // Mientras la config de la cuenta carga no se pinta ningún botón: el orden
  // y las etiquetas salen de `reception_groups`, y pintarlos antes los
  // mostraría en otro orden (el de aparición) para reacomodarlos después. Si
  // la config FALLA sí se pintan, con orden de aparición y etiqueta derivada
  // de la clave: filtrar por grupo sigue funcionando.
  if (tenantConfigPending) return null
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
          </button>
        )
      })}
    </div>
  )
}

// ─── Selector "Ver" — foco de área configurable por usuario (paso 2/3) ────────
//
// Pedido del dueño sobre `agenda_area_focus` (migración 062): el recorte a
// rehabilitación de ISADI era invisible y no se podía desactivar desde la
// interfaz. Textual: "un selector al lado de los filtros del Calendario...
// que ofrezca lo que es Fisioterapia, por su nombre... y que sea
// persistente... guardado como config de preferencia para ese usuario
// logueado". El comportamiento actual (recortar) sigue siendo el DEFAULT de
// la cuenta — ver useAgendaViewPreference — este control solo permite
// cambiarlo.
//
// Vive ACÁ (junto a AgendaServiceButtons) y no en AgendaView porque, igual
// que los botones de grupo, es autosuficiente respecto de la config de la
// cuenta: lee `agendaAreaFocus`/`agendaAreaFocusLabel` de useTenantConfig
// para decidir si se pinta y con qué texto. El VALOR seleccionado y el
// guardado los controla AgendaView (mismo patrón que receptionGroup con
// AgendaServiceButtons) porque también los necesita para filtrar los turnos.
export interface AgendaFocusSelectorProps {
  value: 'foco' | 'todos'
  onChange: (value: 'foco' | 'todos') => void
}

/**
 * Selector "Ver": alterna entre el foco por defecto de la cuenta (etiqueta
 * configurable, ej. "Rehabilitación") y "Todos los servicios". SOLO se pinta
 * si la cuenta tiene `agenda_area_focus` configurado — si no, no hay nada
 * que elegir (el recorte no existe para esa cuenta). Mientras la config de
 * la cuenta carga no se pinta, mismo criterio que AgendaServiceButtons
 * (evita mostrarlo y esconderlo un instante después).
 */
export function AgendaFocusSelector({ value, onChange }: AgendaFocusSelectorProps) {
  const { agendaAreaFocus, agendaAreaFocusLabel, isPending: tenantConfigPending } = useTenantConfig()

  if (tenantConfigPending) return null
  if (agendaAreaFocus !== 'rehab') return null

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="agenda-focus-selector"
        className="text-sm text-[var(--color-text-secondary)] whitespace-nowrap"
      >
        Ver
      </label>
      <select
        id="agenda-focus-selector"
        value={value}
        onChange={(e) => onChange(e.target.value === 'todos' ? 'todos' : 'foco')}
        className="min-h-[44px] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]"
        aria-label="Ver"
      >
        <option value="foco">{agendaAreaFocusLabel}</option>
        <option value="todos">Todos los servicios</option>
      </select>
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
