'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import type { Appointment } from '@/types/appointments'

interface SyncStatusBannerProps {
  appointments: Appointment[]
  date: string // ISO date 'YYYY-MM-DD'
}

type SyncState = 'idle' | 'syncing' | 'error'

export function SyncStatusBanner({ appointments, date }: SyncStatusBannerProps) {
  const queryClient = useQueryClient()
  const [syncState, setSyncState] = useState<SyncState>('idle')

  const hasPending = appointments.some(a => a.calendar_event_id === null)

  if (!hasPending) return null

  const message =
    syncState === 'syncing'
      ? 'Sincronizando...'
      : syncState === 'error'
        ? 'No se pudo iniciar la sincronización. Intenta nuevamente.'
        : 'Sincronización con Google Calendar pendiente'

  async function handleSync() {
    setSyncState('syncing')
    try {
      const res = await fetch('/api/appointments/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      if (res.ok) {
        // Invalidar para refrescar calendar_event_id de los turnos
        await queryClient.invalidateQueries({ queryKey: ['agenda', 'day', date] })
        setSyncState('idle')
      } else {
        setSyncState('error')
      }
    } catch {
      setSyncState('error')
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 px-4 py-3 mb-3 rounded-[var(--radius-sm)] bg-[var(--color-surface)] border-l-4 border-yellow-500 text-sm text-[var(--color-text-secondary)]"
    >
      <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" aria-hidden="true" />
      <span className="flex-1">{message}</span>
      <button
        onClick={handleSync}
        disabled={syncState === 'syncing'}
        className="min-h-[44px] min-w-[44px] flex items-center justify-center gap-2 px-3 rounded-[var(--radius-sm)] text-sm text-[var(--color-interactive)] hover:bg-[var(--color-surface)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        aria-label="Sincronizar turnos pendientes con Google Calendar"
      >
        <RefreshCw
          className={`w-4 h-4 ${syncState === 'syncing' ? 'animate-spin' : ''}`}
          aria-hidden="true"
        />
        {syncState === 'syncing' ? 'Sincronizando...' : 'Sincronizar ahora'}
      </button>
    </div>
  )
}
