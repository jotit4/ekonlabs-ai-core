'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { usePromptHistory } from '@/hooks/use-prompt-history'
import type { SystemPromptHistoryEntry } from '@/types/agente'

// ── Skeleton ─────────────────────────────────────────────────────────────────

function PromptHistorySkeleton() {
  return (
    <div role="status" aria-label="Cargando historial de cambios" className="animate-pulse space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-16 bg-[var(--color-surface)] rounded-[8px]" />
      ))}
    </div>
  )
}

// ── Entry ─────────────────────────────────────────────────────────────────────

function PromptHistoryEntryItem({
  entry,
  isExpanded,
  onToggle,
}: {
  entry: SystemPromptHistoryEntry
  isExpanded: boolean
  onToggle: () => void
}) {
  const displayUser = entry.user_id.slice(0, 8) + '...'
  const formattedDate = entry.changed_at
    ? format(new Date(entry.changed_at), 'dd MMM yyyy, HH:mm', { locale: es })
    : 'Fecha desconocida'

  return (
    <li className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-[var(--color-text-primary)]">
            {formattedDate}
          </span>
          <span className="text-xs text-[var(--color-text-secondary)]">
            Admin: {displayUser}
          </span>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          className="text-sm text-[var(--color-interactive)] hover:underline shrink-0"
        >
          {isExpanded ? 'Ocultar' : 'Ver cambio'}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <span className="text-[11px] font-semibold uppercase text-[var(--color-text-secondary)] block mb-1">
              Antes
            </span>
            <pre className="text-sm bg-[var(--color-surface)] rounded-[8px] p-3 whitespace-pre-wrap">
              {entry.previous_content ?? '(sin override previo — primera configuración)'}
            </pre>
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase text-[var(--color-text-secondary)] block mb-1">
              Después
            </span>
            <pre className="text-sm bg-[var(--color-surface)] rounded-[8px] p-3 whitespace-pre-wrap">
              {entry.new_content ?? '(vacío)'}
            </pre>
          </div>
        </div>
      )}
    </li>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function PromptHistoryView() {
  const { history, isPending, isError, refetch } = usePromptHistory()
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <section aria-label="Historial de cambios del prompt" className="space-y-4">
      {isPending && <PromptHistorySkeleton />}

      {isError && !isPending && (
        <div
          role="alert"
          className="flex items-center gap-3 p-4 bg-[var(--color-surface)] rounded-[8px] border border-[var(--color-border)]"
        >
          <span className="text-[var(--color-text-secondary)]">
            No se pudo cargar el historial de cambios.
          </span>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-[var(--color-interactive)] text-sm font-medium hover:underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {!isPending && !isError && history.length === 0 && (
        <p className="text-sm text-[var(--color-text-secondary)]">
          No hay cambios de prompt registrados
        </p>
      )}

      {!isPending && !isError && history.length > 0 && (
        <ul role="list" className="space-y-3">
          {history.map((entry) => (
            <PromptHistoryEntryItem
              key={entry.id}
              entry={entry}
              isExpanded={expandedIds.has(entry.id)}
              onToggle={() => toggleExpanded(entry.id)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
