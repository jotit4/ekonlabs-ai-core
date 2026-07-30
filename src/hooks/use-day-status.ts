'use client'

import { useQuery } from '@tanstack/react-query'
import type { DayStatusEntry } from '@/types/holidays'

// GET /api/agenda/day-status?date_from=...&date_to=... — feriados + decisión
// de la clínica para el rango visible (Semana/Mes). Solo lista días
// "especiales" (feriado y/o con decisión) — un día ausente es normal/abierto.
export function useDayStatusRange(dateFrom: string, dateTo: string, enabled = true) {
  const query = useQuery({
    queryKey: ['agenda', 'day-status', dateFrom, dateTo],
    queryFn: async (): Promise<Record<string, DayStatusEntry>> => {
      const res = await fetch(`/api/agenda/day-status?date_from=${dateFrom}&date_to=${dateTo}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'fetch_failed')
      }
      const body = await res.json() as { days: Record<string, DayStatusEntry> }
      return body.days
    },
    staleTime: 60 * 1000,
    retry: 1,
    enabled,
  })

  return {
    days: query.data ?? {},
    isLoading: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
  }
}
