'use client'

import { useQuery } from '@tanstack/react-query'
import type { Appointment } from '@/types/appointments'

export interface UseMyAgendaResult {
  appointments: Appointment[]
  isPending: boolean
  isError: boolean
  errorStatus: number | null
  refetch: () => void
}

export function useMyAgenda(isoDate: string): UseMyAgendaResult {
  const query = useQuery({
    queryKey: ['mi-agenda', isoDate],
    queryFn: async () => {
      const res = await fetch(`/api/appointments/mi-agenda?fecha=${isoDate}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        const err = new Error(body.error ?? 'fetch_failed') as Error & { status: number }
        err.status = res.status
        throw err
      }
      const data = await res.json() as { data: Appointment[] }
      return data.data
    },
    staleTime: 0,
    retry: 1,
  })

  const errorStatus =
    query.error instanceof Error && 'status' in query.error
      ? (query.error as Error & { status: number }).status
      : null

  return {
    appointments: query.data ?? [],
    isPending: query.isPending,
    isError: query.isError,
    errorStatus,
    refetch: query.refetch,
  }
}
