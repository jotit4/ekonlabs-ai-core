'use client'

import { useQuery } from '@tanstack/react-query'
import type { Service } from '@/types/servicios'

export function useServices() {
  const query = useQuery<Service[]>({
    queryKey: ['servicios', 'list'],
    queryFn: async () => {
      const res = await fetch('/api/servicios')
      if (!res.ok) {
        throw new Error('Error al obtener servicios')
      }
      const body = await res.json() as { data: Service[] }
      return body.data
    },
    staleTime: 60 * 1000, // 60 segundos — datos semi-estáticos
    retry: 1,
  })

  return {
    services: query.data ?? [],
    isPending: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
  }
}
