'use client'

import { WifiOff, AlertCircle } from 'lucide-react'

interface GCalDegradationBannerProps {
  status: 'healthy' | 'degraded' | 'unknown'
}

export function GCalDegradationBanner({ status }: GCalDegradationBannerProps) {
  if (status === 'healthy') return null

  const isDegraded = status === 'degraded'

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-3 px-4 py-3 mb-3 rounded-[var(--radius-sm)] bg-[var(--color-surface)] border-l-4 text-sm text-[var(--color-text-secondary)] ${
        isDegraded ? 'border-orange-500' : 'border-[var(--color-text-secondary)]'
      }`}
    >
      {isDegraded
        ? <WifiOff className="w-4 h-4 text-orange-500 shrink-0" aria-hidden="true" />
        : <AlertCircle className="w-4 h-4 shrink-0 opacity-60" aria-hidden="true" />
      }
      <span className="flex-1">
        {isDegraded
          ? 'Actualizaciones de Google Calendar en pausa. Renovando...'
          : 'Estado de sincronización con Google Calendar desconocido.'
        }
      </span>
    </div>
  )
}
