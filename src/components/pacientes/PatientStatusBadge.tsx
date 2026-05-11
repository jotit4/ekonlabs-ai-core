'use client'

import { StatusDot, type StatusDotVariant } from '@/components/shared/StatusDot'

interface ThreadState {
  status: 'active' | 'paused'
  paused_reason: string | null
}

interface PatientStatusBadgeProps {
  threadState: ThreadState | null | undefined
}

function getVariantAndLabel(threadState: ThreadState | null | undefined): {
  variant: StatusDotVariant
  label: string
} {
  if (!threadState) {
    return { variant: 'inactive', label: 'Sin conversación activa' }
  }

  if (threadState.status === 'active') {
    return { variant: 'active', label: 'IA activa' }
  }

  if (threadState.status === 'paused') {
    if (threadState.paused_reason === 'human_takeover') {
      return { variant: 'human', label: 'Transferida' }
    }
    if (threadState.paused_reason === 'low_confidence') {
      return { variant: 'warning', label: 'Necesita ayuda' }
    }
  }

  return { variant: 'inactive', label: 'Sin conversación activa' }
}

export function PatientStatusBadge({ threadState }: PatientStatusBadgeProps) {
  const { variant, label } = getVariantAndLabel(threadState)

  return (
    <span
      aria-label={`Estado del agente: ${label}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 14,
        color: 'var(--color-text-secondary)',
      }}
    >
      <StatusDot variant={variant} label={label} />
      {label}
    </span>
  )
}
