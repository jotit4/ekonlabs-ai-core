'use client'

import { useQuery } from '@tanstack/react-query'

/**
 * Lee el estado de shadow_mode desde `GET /api/agente/shadow-mode` (tabla `tenants`).
 * Desacoplado de la config del agente (`v2_clinic_configs`) a partir de la Story 6.6.
 */
export function useShadowMode() {
  const query = useQuery<boolean>({
    queryKey: ['agente', 'shadow-mode'],
    queryFn: async () => {
      const response = await fetch('/api/agente/shadow-mode')
      if (!response.ok) {
        throw new Error(`Error al obtener shadow mode: ${response.status}`)
      }
      const json = await response.json() as { data: { shadow_mode_enabled: boolean } }
      return json.data.shadow_mode_enabled
    },
    staleTime: 60 * 1000,
    retry: 1,
  })

  return {
    shadowModeEnabled: query.data ?? false,
    isPending: query.isPending,
    isError: query.isError,
  }
}
