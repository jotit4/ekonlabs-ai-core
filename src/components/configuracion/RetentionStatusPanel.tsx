'use client'

import { format, parseISO, isValid } from 'date-fns'
import { es } from 'date-fns/locale'
import { useRetentionStatus } from '@/hooks/use-retention-status'
import { RETENTION_POLICIES } from '@/types/retention'
import type { RetentionStatusResponse } from '@/types/retention'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRetentionDate(isoString: string | null): string {
  if (!isoString) return 'No disponible'
  const parsed = parseISO(isoString)
  if (!isValid(parsed)) return 'Fecha inválida'
  return format(parsed, 'dd/MM/yyyy HH:mm', { locale: es })
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function RetentionSkeleton() {
  return (
    <div
      role="status"
      aria-label="Cargando estado de retención"
      className="animate-pulse space-y-3"
    >
      <div className="h-8 bg-[var(--color-surface)] rounded-[8px] w-1/3" />
      <div className="h-12 bg-[var(--color-surface)] rounded-[8px]" />
      <div className="h-12 bg-[var(--color-surface)] rounded-[8px]" />
    </div>
  )
}

// ── Policy Table ──────────────────────────────────────────────────────────────

function PolicyTable() {
  return (
    <div>
      <h3 className="text-[15px] font-semibold text-[var(--color-text-primary)] mb-3">
        Políticas de retención vigentes
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-text-secondary)]">
              <th className="pb-2 pr-4 font-medium">Tipo de datos</th>
              <th className="pb-2 pr-4 font-medium">Período</th>
              <th className="pb-2 font-medium">Descripción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {RETENTION_POLICIES.map((policy) => (
              <tr key={policy.name} className="h-12">
                <td className="pr-4 font-medium text-[var(--color-text-primary)]">
                  {policy.label}
                </td>
                <td className="pr-4 text-[var(--color-text-secondary)]">
                  {policy.retentionDays} días
                </td>
                <td className="text-[var(--color-text-secondary)]">{policy.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Job Status Badge ──────────────────────────────────────────────────────────

function JobStatusBadge({ status }: { status: RetentionStatusResponse['status'] }) {
  const styles: Record<
    RetentionStatusResponse['status'],
    { bg: string; color: string; label: string }
  > = {
    ok: {
      bg: 'rgba(52,199,89,0.12)',
      color: 'var(--color-status-ok)',
      label: 'En operación',
    },
    running: {
      bg: 'rgba(0,113,227,0.12)',
      color: 'var(--color-interactive)',
      label: 'Ejecutando',
    },
    failed: {
      bg: 'rgba(255,59,48,0.12)',
      color: 'var(--color-status-alert)',
      label: 'Fallo',
    },
    overdue: {
      bg: 'rgba(255,159,10,0.12)',
      color: 'var(--color-status-warn)',
      label: 'Atrasado',
    },
  }

  const style = styles[status]

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 10px',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 500,
        backgroundColor: style.bg,
        color: style.color,
      }}
    >
      {style.label}
    </span>
  )
}

// ── Job Status Section ────────────────────────────────────────────────────────

function JobStatusSection({ data }: { data: RetentionStatusResponse }) {
  return (
    <div className="mt-6">
      <h3 className="text-[15px] font-semibold text-[var(--color-text-primary)] mb-3">
        Estado del job de retención
      </h3>

      <div className="flex items-center gap-3 mb-4">
        <span className="text-sm text-[var(--color-text-secondary)]">Estado:</span>
        <JobStatusBadge status={data.status} />
      </div>

      {data.status === 'failed' && (
        <div
          role="alert"
          className="mb-4 p-3 rounded-[8px] bg-[rgba(255,59,48,0.08)] border border-[rgba(255,59,48,0.2)]"
        >
          <p className="text-sm font-medium text-[var(--color-status-alert)]">
            Último job falló
          </p>
          {data.error_message && (
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">{data.error_message}</p>
          )}
        </div>
      )}

      {data.status === 'overdue' && (
        <div
          role="alert"
          className="mb-4 p-3 rounded-[8px] bg-[rgba(255,159,10,0.08)] border border-[rgba(255,159,10,0.2)]"
        >
          <p className="text-sm font-medium text-[var(--color-status-warn)]">
            Job atrasado — sin ejecución reciente
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-sm">
        <div>
          <span className="text-[var(--color-text-secondary)]">Última ejecución</span>
          <p className="mt-1 font-medium text-[var(--color-text-primary)]">
            {formatRetentionDate(data.last_run_at)}
          </p>
        </div>
        <div>
          <span className="text-[var(--color-text-secondary)]">Próxima ejecución</span>
          <p className="mt-1 font-medium text-[var(--color-text-primary)]">
            {formatRetentionDate(data.next_run_at)}
          </p>
        </div>
        <div>
          <span className="text-[var(--color-text-secondary)]">Registros purgados (última)</span>
          <p className="mt-1 font-medium text-[var(--color-text-primary)]">
            {data.records_purged_last_run !== null
              ? data.records_purged_last_run.toString()
              : 'No disponible'}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function RetentionStatusPanel() {
  const { result, isPending, isError, refetch } = useRetentionStatus()

  if (isPending) {
    return (
      <section aria-label="Política de retención de datos" className="mt-2">
        <RetentionSkeleton />
      </section>
    )
  }

  return (
    <section aria-label="Política de retención de datos" className="mt-2">
      <h2 className="text-[18px] font-semibold text-[var(--color-text-primary)] mb-4">
        Retención de datos
      </h2>

      {/* Políticas estáticas — siempre visibles */}
      <PolicyTable />

      {/* Estado del job — varía según el resultado */}
      {result?.status === 'ok' && result.data && (
        <JobStatusSection data={result.data} />
      )}

      {result?.status === 'not_implemented' && (
        <div
          className="mt-6 p-4 rounded-[8px] bg-[var(--color-surface)] border border-[var(--color-border)]"
        >
          <p className="text-sm text-[var(--color-text-secondary)]">
            El monitoreo del job de retención estará disponible próximamente.
          </p>
        </div>
      )}

      {(result?.status === 'degraded' || isError) && (
        <div
          role="alert"
          className="mt-6 p-4 rounded-[8px] bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-between gap-4"
        >
          <p className="text-sm text-[var(--color-text-secondary)]">
            Estado del job no disponible temporalmente. Los datos de auditoría siguen siendo
            accesibles.
          </p>
          {isError && (
            <button
              onClick={() => refetch()}
              className="text-[var(--color-interactive)] text-sm font-medium hover:underline shrink-0"
            >
              Reintentar
            </button>
          )}
        </div>
      )}
    </section>
  )
}
