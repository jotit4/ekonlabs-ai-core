'use client'

import type { ReactNode } from 'react'

interface EmptyStateProps {
  /** Icono principal (recomendado: lucide-react, 24px). */
  icon: ReactNode
  /** Título visible. */
  title: string
  /** Descripción secundaria, opcional. */
  description?: string
  /** Acción primaria opcional (botón de texto). */
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

/**
 * Estado vacío reutilizable en toda la aplicación.
 *
 * Uso:
 * ```tsx
 * <EmptyState
 *   icon={<CalendarOff className="h-6 w-6" />}
 *   title="No hay turnos para este día"
 *   description="Usá el botón 'Dar turno' para agregar uno."
 *   action={{ label: 'Dar turno', onClick: handleNuevoTurno }}
 * />
 * ```
 */
export function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div
      className={[
        'flex flex-col items-center gap-2',
        'rounded-[18px] border border-dashed border-[var(--color-border)]',
        'bg-[var(--color-surface)] py-12 text-center',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Icono en círculo */}
      <span
        aria-hidden="true"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(0,0,0,0.06)] text-[var(--color-text-secondary)] dark:bg-[rgba(255,255,255,0.08)]"
      >
        {icon}
      </span>

      {/* Título */}
      <p className="mt-1 text-[16px] font-medium text-[var(--color-text-primary)]">{title}</p>

      {/* Descripción */}
      {description && (
        <p className="max-w-[320px] text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          {description}
        </p>
      )}

      {/* Acción */}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-2 min-h-[44px] px-4 text-sm font-medium text-[var(--color-interactive)] hover:underline"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
