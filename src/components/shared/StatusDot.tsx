'use client'

import type { AppointmentStatus } from '@/types/appointments'

export type StatusDotVariant = 'active' | 'warning' | 'alert' | 'inactive' | 'human'

const VARIANT_COLORS: Record<StatusDotVariant, string> = {
  active: '#34c759',
  warning: '#ff9f0a',
  alert: '#ff3b30',
  inactive: 'rgba(0,0,0,0.2)',
  human: '#0071e3',
}

export function statusToVariant(status: AppointmentStatus): StatusDotVariant {
  switch (status) {
    case 'confirmed':
      return 'active'
    case 'pending':
      return 'warning'
    case 'rescheduled':
      return 'warning'
    case 'cancelled':
      return 'inactive'
    case 'no_show':
      return 'alert'
  }
}

interface StatusDotProps {
  variant: StatusDotVariant
  label: string
}

export function StatusDot({ variant, label }: StatusDotProps) {
  return (
    <span
      aria-label={`Estado: ${label}`}
      role="img"
      style={{
        display: 'inline-block',
        width: 9,
        height: 9,
        borderRadius: '50%',
        backgroundColor: VARIANT_COLORS[variant],
        flexShrink: 0,
      }}
    />
  )
}
