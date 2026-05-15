'use client'

import { useQuery } from '@tanstack/react-query'
import type { DistribucionServiciosData } from '@/types/metricas'

const TIMEOUT_MS = 5000

export function useDistribucionServicios(desde: string, hasta: string) {
  const query = useQuery<DistribucionServiciosData>({
    queryKey: ['metricas', 'distribucion-servicios', { desde, hasta }],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ desde, hasta })
      const url = `/api/metricas/distribucion-servicios?${params.toString()}`

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

      const combinedSignal = signal
        ? (() => {
            const combined = new AbortController()
            signal.addEventListener('abort', () => combined.abort())
            controller.signal.addEventListener('abort', () => combined.abort())
            return combined.signal
          })()
        : controller.signal

      try {
        const response = await fetch(url, { signal: combinedSignal })
        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new Error(`Error al obtener distribución de servicios: ${response.status}`)
        }

        const json = await response.json() as { data: DistribucionServiciosData }
        return json.data
      } catch (err) {
        clearTimeout(timeoutId)
        throw err
      }
    },
    staleTime: 5 * 60 * 1000, // 5 min
    retry: false,              // NO retry — patrón post-review de use-clinic-kpis
  })

  return {
    data: query.data ?? null,
    isPending: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
  }
}
