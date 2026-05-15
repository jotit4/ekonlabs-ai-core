'use client'

import { useRouter } from 'next/navigation'
import { format, parseISO, isValid } from 'date-fns'
import { es } from 'date-fns/locale'
import { useDeletionRequests } from '@/hooks/use-deletion-requests'
import type { DeletionRequestRow } from '@/types/deletion-requests'

// ── Helpers ───────────────────────────────────────────────────────────────────

function maskDni(dni: string | null): string {
  if (!dni) return '—'
  return dni.slice(0, 3) + '···'
}

function formatDeletionDate(isoString: string | null): string {
  if (!isoString) return '—'
  const parsed = parseISO(isoString)
  if (!isValid(parsed)) return 'Fecha inválida'
  return format(parsed, 'dd/MM/yyyy', { locale: es })
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function DeletionRequestsSkeleton() {
  return (
    <div
      role="status"
      aria-label="Cargando solicitudes de supresión"
      className="animate-pulse space-y-2"
    >
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-12 bg-[var(--color-surface)] rounded-[8px]" />
      ))}
    </div>
  )
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: DeletionRequestRow['status'] }) {
  if (status === 'pending') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '2px 8px',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 500,
          backgroundColor: 'rgba(255,159,10,0.15)',
          color: 'var(--color-status-warn)',
          whiteSpace: 'nowrap',
        }}
      >
        Pendiente
      </span>
    )
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 500,
        backgroundColor: 'rgba(0,0,0,0.06)',
        color: 'var(--color-text-secondary)',
        whiteSpace: 'nowrap',
      }}
    >
      Procesada
    </span>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function DeletionRequestsPanel() {
  const router = useRouter()
  const { requests, isPending, isError, refetch } = useDeletionRequests()

  return (
    <section aria-label="Solicitudes de supresión de datos" className="space-y-4">
      {isPending && <DeletionRequestsSkeleton />}

      {isError && !isPending && (
        <div
          role="alert"
          className="flex items-center gap-3 p-4 bg-[var(--color-surface)] rounded-[8px] border border-[var(--color-border)]"
        >
          <span className="text-[var(--color-text-secondary)]">
            No se pudieron cargar las solicitudes de supresión.
          </span>
          <button
            onClick={() => refetch()}
            className="text-[var(--color-interactive)] text-sm font-medium hover:underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {!isPending && !isError && requests.length === 0 && (
        <p className="text-[var(--color-text-secondary)] text-sm">
          No hay solicitudes de supresión registradas.
        </p>
      )}

      {!isPending && !isError && requests.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-text-secondary)]">
                <th className="pb-2 pr-4 font-medium">Paciente</th>
                <th className="pb-2 pr-4 font-medium">DNI parcial</th>
                <th className="pb-2 pr-4 font-medium">Fecha solicitud</th>
                <th className="pb-2 pr-4 font-medium">Fecha efectiva</th>
                <th className="pb-2 pr-4 font-medium">Estado</th>
                <th className="pb-2 font-medium">Audit log</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {requests.map((row) => (
                <tr key={row.patient_id} className="h-12">
                  <td className="pr-4 text-[var(--color-text-primary)]">
                    {row.full_name || 'Paciente anonimizado'}
                  </td>
                  <td className="pr-4 text-[var(--color-text-secondary)] font-mono text-xs">
                    {maskDni(row.dni)}
                  </td>
                  <td className="pr-4 text-[var(--color-text-secondary)] whitespace-nowrap">
                    {formatDeletionDate(row.deletion_requested_at)}
                  </td>
                  <td className="pr-4 text-[var(--color-text-secondary)] whitespace-nowrap">
                    {formatDeletionDate(row.deletion_effective_at)}
                  </td>
                  <td className="pr-4">
                    <StatusBadge status={row.status} />
                  </td>
                  <td>
                    <button
                      onClick={() =>
                        router.push(
                          `/configuracion/auditoria?action=patient_deleted&entity_id=${row.patient_id}`
                        )
                      }
                      className="text-[var(--color-interactive)] text-sm font-medium hover:underline"
                    >
                      Ver en auditoría
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
