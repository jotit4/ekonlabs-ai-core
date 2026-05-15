'use client'

import { useQuery } from '@tanstack/react-query'
import type { RetentionStatusResult } from '@/types/retention'

export function useRetentionStatus() {
  const query = useQuery<RetentionStatusResult>({
    queryKey: ['retention_status'],
    queryFn: async () => {
      const response = await fetch('/api/retention-status')
      if (!response.ok) {
        throw new Error(`Error al obtener estado de retención: ${response.status}`)
      }
      return response.json() as Promise<RetentionStatusResult>
    },
    staleTime: 5 * 60 * 1000, // 5 minutos — el job corre una vez al día
    retry: 1,
  })

  return {
    result: query.data ?? null,
    isPending: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
  }
}
