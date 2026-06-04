'use client'

import { useQuery } from '@tanstack/react-query'
import type { ClinicAgentConfig } from '@/types/agente'

export function useAgentConfig() {
  const query = useQuery<ClinicAgentConfig>({
    queryKey: ['agente', 'config'],
    queryFn: async () => {
      const response = await fetch('/api/agente/config')
      if (!response.ok) {
        throw new Error(`Error al obtener configuración del agente: ${response.status}`)
      }
      const json = await response.json() as { data: ClinicAgentConfig }
      return json.data
    },
    staleTime: 60 * 1000, // 60 segundos — configuración semi-estática
    retry: 1,
  })

  return {
    config: query.data ?? null,
    isPending: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
  }
}
