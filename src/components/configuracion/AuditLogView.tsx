'use client'

import { useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useAuditLog } from '@/hooks/use-audit-log'
import { AuditFilters } from './AuditFilters'
import type { AuditLogEntry, AuditFilters as AuditFiltersType } from '@/types/audit'
import type { AuditAction } from '@/lib/audit'

// ── URL helpers ────────────────────────────────────────────────────────────────

function filtersFromURL(searchParams: URLSearchParams): AuditFiltersType {
  return {
    action: (searchParams.get('action') as AuditAction | null) ?? null,
    userId: searchParams.get('user') ?? null,
    dateFrom: searchParams.get('from') ?? null,
    dateTo: searchParams.get('to') ?? null,
  }
}

function buildURL(filters: AuditFiltersType): string {
  const params = new URLSearchParams()
  if (filters.action) params.set('action', filters.action)
  if (filters.userId) params.set('user', filters.userId)
  if (filters.dateFrom) params.set('from', filters.dateFrom)
  if (filters.dateTo) params.set('to', filters.dateTo)
  const qs = params.toString()
  return qs ? `/configuracion/auditoria?${qs}` : '/configuracion/auditoria'
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function AuditLogSkeleton() {
  return (
    <div role="status" aria-label="Cargando registros de auditoría" className="animate-pulse space-y-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-12 bg-[var(--color-surface)] rounded-[8px]" />
      ))}
    </div>
  )
}

// ── ActionBadge ───────────────────────────────────────────────────────────────

const ACTION_BADGE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  patient_accessed: {
    bg: 'rgba(0,0,0,0.06)',
    color: 'var(--color-text-secondary)',
    label: 'Paciente consultado',
  },
  patient_data_updated: {
    bg: 'rgba(0,113,227,0.12)',
    color: 'var(--color-interactive)',
    label: 'Datos actualizados',
  },
  patient_deleted: {
    bg: 'rgba(255,59,48,0.12)',
    color: 'var(--color-status-alert)',
    label: 'Paciente eliminado',
  },
  conversation_takeover: {
    bg: 'rgba(0,113,227,0.12)',
    color: 'var(--color-interactive)',
    label: 'Takeover',
  },
  conversation_released: {
    bg: 'rgba(0,113,227,0.07)',
    color: 'var(--color-interactive)',
    label: 'Liberado',
  },
  appointment_created: {
    bg: 'rgba(52,199,89,0.12)',
    color: 'var(--color-status-ok)',
    label: 'Turno creado',
  },
  appointment_rescheduled: {
    bg: 'rgba(255,159,10,0.12)',
    color: 'var(--color-status-warn)',
    label: 'Reprogramado',
  },
  config_system_prompt_updated: {
    bg: 'rgba(88,86,214,0.12)',
    color: '#5856d6',
    label: 'Prompt actualizado',
  },
  config_shadow_mode_updated: {
    bg: 'rgba(88,86,214,0.12)',
    color: '#5856d6',
    label: 'Shadow Mode actualizado',
  },
  user_created: {
    bg: 'rgba(52,199,89,0.12)',
    color: 'var(--color-status-ok)',
    label: 'Usuario creado',
  },
  user_deactivated: {
    bg: 'rgba(255,59,48,0.12)',
    color: 'var(--color-status-alert)',
    label: 'Usuario desactivado',
  },
  user_activated: {
    bg: 'rgba(52,199,89,0.12)',
    color: 'var(--color-status-ok)',
    label: 'Usuario activado',
  },
  user_updated: {
    bg: 'rgba(0,113,227,0.12)',
    color: 'var(--color-interactive)',
    label: 'Usuario actualizado',
  },
}

function ActionBadge({ action }: { action: string }) {
  const style = ACTION_BADGE_STYLES[action]
  const label = style?.label ?? action
  const bg = style?.bg ?? 'rgba(0,0,0,0.06)'
  const color = style?.color ?? 'var(--color-text-secondary)'

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 500,
        backgroundColor: bg,
        color,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function displayUser(userId: string, userMap: Record<string, string>): string {
  return userMap[userId] ?? `${userId.slice(0, 8)}...`
}

function displayEntityType(entityType: string): string {
  const labels: Record<string, string> = {
    patient: 'paciente',
    conversation: 'conversación',
    appointment: 'turno',
    config: 'configuración',
    user: 'usuario',
  }
  return labels[entityType] ?? entityType
}

function formatDate(isoString: string): string {
  return format(new Date(isoString), 'dd/MM/yyyy HH:mm:ss', { locale: es })
}

// ── Main Component ────────────────────────────────────────────────────────────

export function AuditLogView() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [filters, setFilters] = useState<AuditFiltersType>(() => filtersFromURL(searchParams))

  const handleFiltersChange = useCallback(
    (newFilters: AuditFiltersType) => {
      setFilters(newFilters)
      router.replace(buildURL(newFilters))
    },
    [router],
  )

  const { logs, userMap, allUsers, totalPages, page, setPage, isPending, isError, refetch } =
    useAuditLog(filters)

  const hasActiveFilters =
    !!filters.action || !!filters.userId || !!filters.dateFrom || !!filters.dateTo

  return (
    <div>
      <AuditFilters filters={filters} onFiltersChange={handleFiltersChange} users={allUsers} />

      {isPending && <AuditLogSkeleton />}

      {isError && !isPending && (
        <div
          role="alert"
          className="flex items-center gap-3 p-4 bg-[var(--color-surface)] rounded-[8px] border border-[var(--color-border)]"
        >
          <span className="text-[var(--color-text-secondary)]">
            No se pudo cargar el log de auditoría.
          </span>
          <button
            onClick={() => refetch()}
            className="text-[var(--color-interactive)] text-sm font-medium hover:underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {!isPending && !isError && logs.length === 0 && !hasActiveFilters && (
        <p className="text-[var(--color-text-secondary)] text-sm">
          No hay registros de auditoría aún.
        </p>
      )}

      {!isPending && !isError && logs.length === 0 && hasActiveFilters && (
        <div className="flex flex-col items-center gap-3 py-8">
          <p className="text-[var(--color-text-secondary)] text-sm">
            No hay registros para los filtros seleccionados.
          </p>
          <button
            onClick={() => handleFiltersChange({})}
            className="text-[var(--color-interactive)] text-sm font-medium hover:underline"
          >
            Limpiar filtros
          </button>
        </div>
      )}

      {!isPending && !isError && logs.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-text-secondary)]">
                <th className="pb-2 pr-4 font-medium">Fecha/Hora</th>
                <th className="pb-2 pr-4 font-medium">Usuario</th>
                <th className="pb-2 pr-4 font-medium">Acción</th>
                <th className="pb-2 pr-4 font-medium">Entidad</th>
                <th className="pb-2 font-medium">Identificador</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {logs.map((log: AuditLogEntry) => (
                <tr key={log.id} className="h-12">
                  <td className="pr-4 text-[var(--color-text-secondary)] whitespace-nowrap">
                    {formatDate(log.created_at)}
                  </td>
                  <td className="pr-4 text-[var(--color-text-primary)]">
                    {displayUser(log.user_id, userMap)}
                  </td>
                  <td className="pr-4">
                    <ActionBadge action={log.action} />
                  </td>
                  <td className="pr-4 text-[var(--color-text-secondary)]">
                    {displayEntityType(log.entity_type)}
                  </td>
                  <td className="text-[var(--color-text-secondary)] font-mono text-xs">
                    {log.entity_id}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginación */}
      {!isPending && !isError && logs.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end', alignItems: 'center' }}>
          <button
            onClick={() => setPage((p) => p - 1)}
            disabled={page === 0}
            className={[
              'text-xs font-medium px-3 py-1 rounded-[6px] border transition-colors min-h-[36px]',
              'border-[var(--color-border)] text-[var(--color-text-secondary)]',
              'hover:bg-[var(--color-surface)] disabled:opacity-40 disabled:cursor-not-allowed',
            ].join(' ')}
          >
            Anterior
          </button>
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Página {page + 1} de {totalPages || 1}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages - 1}
            className={[
              'text-xs font-medium px-3 py-1 rounded-[6px] border transition-colors min-h-[36px]',
              'border-[var(--color-border)] text-[var(--color-text-secondary)]',
              'hover:bg-[var(--color-surface)] disabled:opacity-40 disabled:cursor-not-allowed',
            ].join(' ')}
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  )
}
