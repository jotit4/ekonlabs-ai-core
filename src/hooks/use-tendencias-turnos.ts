'use client'

import { useQuery } from '@tanstack/react-query'
import type { TendenciasTurnosData } from '@/types/metricas'

async function fetchTendenciasTurnos(
  desde: string,
  hasta: string
): Promise<TendenciasTurnosData> {
  const params = new URLSearchParams({ desde, hasta })
  const res = await fetch(`/api/metricas/tendencias-turnos?${params}`)

  if (!res.ok) {
    throw new Error(`Error ${res.status} al cargar tendencias de turnos`)
  }

  const json = await res.json() as { data: TendenciasTurnosData }
  return json.data
}

export function useTendenciasTurnos(desde: string, hasta: string) {
  return useQuery({
    queryKey: ['metricas', 'tendencias-turnos', { desde, hasta }],
    queryFn: () => fetchTendenciasTurnos(desde, hasta),
    staleTime: 5 * 60 * 1000, // 5 min — semi-estático como el resto de métricas
    retry: false,              // NO retry — patrón post-review de use-clinic-kpis
  })
}
