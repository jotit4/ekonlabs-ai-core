'use client'

import { useQuery } from '@tanstack/react-query'
import type { ServiceException } from '@/types/servicios'

export function useServiceExceptions(serviceId: string) {
  const query = useQuery({
    queryKey: ['servicios', serviceId, 'excepciones'],
    queryFn: async (): Promise<ServiceException[]> => {
      const res = await fetch(`/api/servicios/${serviceId}/excepciones`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'fetch_failed')
      }
      const body = await res.json() as { data: ServiceException[] }
      return body.data
    },
    staleTime: 60 * 1000,
    retry: 1,
  })

  return {
    exceptions: query.data ?? [],
    isPending: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
  }
}
