'use client'

import { useQuery } from '@tanstack/react-query'
import type { BlockedTime } from '@/types/profesionales-horarios'

export function useBlockedTimes(professionalId: string) {
  const query = useQuery({
    queryKey: ['profesionales', professionalId, 'bloqueos'],
    queryFn: async (): Promise<BlockedTime[]> => {
      const res = await fetch(`/api/profesionales/${professionalId}/bloqueos`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'fetch_failed')
      }
      const body = await res.json() as { data: BlockedTime[] }
      return body.data
    },
    staleTime: 60_000,
    retry: 1,
  })

  return {
    blockedTimes: query.data ?? [],
    isPending: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
  }
}
