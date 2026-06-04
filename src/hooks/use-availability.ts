'use client'

import { useQuery } from '@tanstack/react-query'
import type {
  AvailabilityShift,
  DayShifts,
  DaySummary,
} from '@/types/availability'

export interface UseAvailabilityOptions {
  dateFrom: string // 'YYYY-MM-DD'
  dateTo: string // 'YYYY-MM-DD'
  serviceId?: string | null
  professionalId?: string | null
  summary?: boolean
  enabled?: boolean
}

export interface UseAvailabilityResult {
  daysShifts: Record<string, DayShifts>
  daysSummary: Record<string, DaySummary>
  isLoading: boolean
  isError: boolean
  refetch: () => void
  /** Helper para vista Día: huecos libres de una fecha (modo shifts). */
  shiftsForDate: (isoDate: string) => AvailabilityShift[]
}

interface AvailabilityResponse {
  days: Record<string, DayShifts> | Record<string, DaySummary>
}

export function useAvailability({
  dateFrom,
  dateTo,
  serviceId,
  professionalId,
  summary = false,
  enabled = true,
}: UseAvailabilityOptions): UseAvailabilityResult {
  const query = useQuery<AvailabilityResponse>({
    queryKey: [
      'availability',
      dateFrom,
      dateTo,
      serviceId ?? '',
      professionalId ?? '',
      summary,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo })
      if (serviceId) params.set('service_id', serviceId)
      if (professionalId) params.set('professional_id', professionalId)
      if (summary) params.set('summary', 'true')

      const res = await fetch(`/api/availability?${params.toString()}`)
      if (!res.ok) {
        throw new Error(`Error al obtener disponibilidad: ${res.status}`)
      }
      return (await res.json()) as AvailabilityResponse
    },
    staleTime: 60_000, // se invalida por Realtime de todos modos
    enabled,
  })

  const daysShifts = (summary ? {} : (query.data?.days ?? {})) as Record<string, DayShifts>
  const daysSummary = (summary ? (query.data?.days ?? {}) : {}) as Record<string, DaySummary>

  return {
    daysShifts,
    daysSummary,
    isLoading: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
    shiftsForDate: (isoDate: string) => daysShifts[isoDate]?.shifts ?? [],
  }
}
