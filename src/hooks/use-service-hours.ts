'use client'

import { useQuery } from '@tanstack/react-query'
import type { ServiceHour } from '@/types/servicios'

export function useServiceHours(serviceId: string) {
  const query = useQuery({
    queryKey: ['servicios', serviceId, 'horarios'],
    queryFn: async (): Promise<ServiceHour[]> => {
      const res = await fetch(`/api/servicios/${serviceId}/horarios`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'fetch_failed')
      }
      const body = await res.json() as { data: ServiceHour[] }
      return body.data
    },
    staleTime: 60 * 1000,
    retry: 1,
  })

  return {
    hours: query.data ?? [],
    isPending: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
  }
}
