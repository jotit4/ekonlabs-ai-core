'use client'

import { useQuery } from '@tanstack/react-query'
import type { ProfessionalSchedule } from '@/types/profesionales-horarios'

export function useProfessionalSchedules(professionalId: string) {
  const query = useQuery({
    queryKey: ['profesionales', professionalId, 'horarios'],
    queryFn: async (): Promise<ProfessionalSchedule[]> => {
      const res = await fetch(`/api/profesionales/${professionalId}/horarios`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'fetch_failed')
      }
      const body = await res.json() as { data: ProfessionalSchedule[] }
      return body.data
    },
    staleTime: 60_000,
    retry: 1,
  })

  return {
    schedules: query.data ?? [],
    isPending: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
  }
}
