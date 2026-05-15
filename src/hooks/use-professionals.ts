'use client'

import { useQuery } from '@tanstack/react-query'
import type { Professional } from '@/types/profesionales'

export function useProfessionals() {
  const query = useQuery<Professional[]>({
    queryKey: ['profesionales', 'list'],
    queryFn: async () => {
      const res = await fetch('/api/profesionales')
      if (!res.ok) {
        throw new Error('Error al obtener profesionales')
      }
      const body = await res.json() as { data: Professional[] }
      return body.data
    },
    staleTime: 60_000, // 60 segundos — datos semi-estáticos
  })

  return {
    professionals: query.data ?? [],
    isPending: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
  }
}
