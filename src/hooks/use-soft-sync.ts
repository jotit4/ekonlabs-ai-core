'use client'

import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'

export type SoftSyncStatus = 'idle' | 'pending' | 'completed' | 'error'

interface SoftSyncResponse {
  status: 'pending' | 'completed' | 'not_found' | 'error'
  job_id?: string
  affected_dates?: string[]
  message?: string
}

export function useSoftSync(): {
  trigger: (patientId: string) => Promise<void>
  status: SoftSyncStatus
} {
  const [status, setStatus] = useState<SoftSyncStatus>('idle')
  const queryClient = useQueryClient()

  const trigger = useCallback(async (patientId: string) => {
    setStatus('pending')
    try {
      const res = await fetch('/api/appointments/soft-sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ patient_id: patientId }),
        signal: AbortSignal.timeout(5000),
      })

      if (!res.ok && res.status !== 202) {
        setStatus('error')
        return
      }

      const data = await res.json() as SoftSyncResponse

      if (data.status === 'error') {
        setStatus('error')
        return
      }

      // Si FastAPI retorna affected_dates, invalidar queries de agenda afectadas
      if (data.affected_dates && data.affected_dates.length > 0) {
        for (const date of data.affected_dates) {
          queryClient.invalidateQueries({ queryKey: ['agenda', 'day', date] })
        }
      }
      // Si no hay affected_dates: no invalidar — useAgendaRealtime cubre los cambios
      // que FastAPI haga en background vía Supabase Realtime

      setStatus(data.status === 'pending' ? 'pending' : 'completed')
    } catch {
      // AbortError (timeout) o error de red — no bloquear la UI
      setStatus('error')
    }
  }, [queryClient])

  return { trigger, status }
}
