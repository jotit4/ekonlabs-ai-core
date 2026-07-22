'use client'

import { DateField } from '@/components/ui/date-field'
import type { AuditAction } from '@/lib/audit'
import type { AuditFilters } from '@/types/audit'

// ── Action labels ─────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  patient_accessed: 'Paciente accedido',
  patient_data_updated: 'Datos de paciente actualizados',
  patient_deleted: 'Paciente eliminado',
  conversation_takeover: 'Takeover de conversación',
  conversation_released: 'Release de conversación',
  appointment_created: 'Turno creado',
  appointment_rescheduled: 'Turno reprogramado',
  config_system_prompt_updated: 'Prompt actualizado',
  config_shadow_mode_updated: 'Shadow Mode actualizado',
  user_created: 'Usuario creado',
  user_deactivated: 'Usuario desactivado',
  user_activated: 'Usuario activado',
  user_updated: 'Usuario actualizado',
}

// ── Styles ────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  minHeight: '44px',
  padding: '0 12px',
  border: '1px solid var(--color-border)',
  borderRadius: '8px',
  background: 'var(--color-bg)',
  color: 'var(--color-text-primary)',
  fontSize: '14px',
  outline: 'none',
  cursor: 'pointer',
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface AuditFiltersProps {
  filters: AuditFilters
  onFiltersChange: (f: AuditFilters) => void
  users: { user_id: string; full_name: string; is_active?: boolean }[]
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AuditFilters({ filters, onFiltersChange, users }: AuditFiltersProps) {
  const hasActiveFilters =
    !!filters.action || !!filters.userId || !!filters.dateFrom || !!filters.dateTo

  return (
    <div
      role="search"
      aria-label="Filtros de auditoría"
      className="flex flex-wrap items-end gap-3 mb-6"
    >
      {/* Control 1: Acción */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="audit-filter-action"
          style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 500 }}
        >
          Acción
        </label>
        <select
          id="audit-filter-action"
          aria-label="Filtrar por acción"
          style={inputStyle}
          value={filters.action ?? ''}
          onChange={(e) =>
            onFiltersChange({ ...filters, action: (e.target.value as AuditAction) || null })
          }
        >
          <option value="">Todas las acciones</option>
          {Object.entries(ACTION_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Control 2: Usuario */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="audit-filter-user"
          style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 500 }}
        >
          Usuario
        </label>
        <select
          id="audit-filter-user"
          aria-label="Filtrar por usuario"
          style={inputStyle}
          value={filters.userId ?? ''}
          onChange={(e) => onFiltersChange({ ...filters, userId: e.target.value || null })}
        >
          <option value="">Todos los usuarios</option>
          {users.map((u) => (
            <option key={u.user_id} value={u.user_id}>
              {u.full_name || `${u.user_id.slice(0, 8)}...`}
              {u.is_active === false ? ' (desactivado)' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Control 3: Desde */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="audit-filter-from"
          style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 500 }}
        >
          Desde
        </label>
        <DateField
          id="audit-filter-from"
          aria-label="Fecha desde"
          value={filters.dateFrom ?? ''}
          onChange={(value) => onFiltersChange({ ...filters, dateFrom: value || null })}
        />
      </div>

      {/* Control 4: Hasta */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="audit-filter-to"
          style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 500 }}
        >
          Hasta
        </label>
        <DateField
          id="audit-filter-to"
          aria-label="Fecha hasta"
          value={filters.dateTo ?? ''}
          onChange={(value) => onFiltersChange({ ...filters, dateTo: value || null })}
        />
      </div>

      {/* Botón Limpiar filtros — visible solo cuando hay filtros activos */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={() => onFiltersChange({})}
          style={{
            minHeight: '44px',
            padding: '0 16px',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            background: 'transparent',
            color: 'var(--color-interactive)',
            fontSize: '14px',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          Limpiar filtros
        </button>
      )}
    </div>
  )
}
