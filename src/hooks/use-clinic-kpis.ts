'use client'

import { useQuery } from '@tanstack/react-query'
import type { ClinicKPIs } from '@/types/metricas'

interface UseClinicKPIsOptions {
  desde: string
  hasta: string
}

const TIMEOUT_MS = 5000

export function useClinicKPIs({ desde, hasta }: UseClinicKPIsOptions) {
  const query = useQuery<ClinicKPIs>({
    queryKey: ['metricas', 'kpis', { desde, hasta }],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ desde, hasta })
      const url = `/api/metricas/kpis?${params.toString()}`

      // Timeout de 5 segundos para mapear a isError
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

      // Combinar signal externo con timeout
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
          throw new Error(`Error al obtener KPIs: ${response.status}`)
        }

        const json = await response.json() as { data: ClinicKPIs }
        return json.data
      } catch (err) {
        clearTimeout(timeoutId)
        throw err
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutos — datos históricos semi-estáticos
    retry: false,
  })

  return {
    kpis: query.data ?? null,
    isPending: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
  }
}
