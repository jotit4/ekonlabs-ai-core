'use client'

import { useQuery } from '@tanstack/react-query'
import type { DeletionRequestRow } from '@/types/deletion-requests'

export function useDeletionRequests() {
  const query = useQuery<DeletionRequestRow[]>({
    queryKey: ['deletion_requests'],
    queryFn: async () => {
      const response = await fetch('/api/patients/deletion-requests')
      if (!response.ok) {
        throw new Error(`Error al obtener solicitudes de supresión: ${response.status}`)
      }
      const json = await response.json() as { data: DeletionRequestRow[] }
      return json.data
    },
    staleTime: 30 * 1000, // 30 segundos — puede cambiar si el admin acaba de crear una
    retry: 1,
  })

  return {
    requests: query.data ?? [],
    isPending: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
  }
}
