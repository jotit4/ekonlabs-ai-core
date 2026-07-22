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
  /**
   * Grupo de servicios (Pedido 1 ISADI 2026-07-16 — "Dar un turno" de
   * recepción para el grupo Fisioterapia, sin elegir servicio ni profesional).
   * Cuando se pasa una lista no vacía, tiene PRIORIDAD sobre `serviceId`: la
   * API consulta TODOS esos service_id a la vez (cada uno con TODOS sus
   * profesionales activos, salvo que venga un `professionalId` concreto) y
   * devuelve la unión de huecos — cada uno conserva su propio
   * service_id/professional_id, así que al confirmar el turno se crea con
   * los del hueco elegido.
   */
  serviceIds?: string[] | null
  professionalId?: string | null
  summary?: boolean
  enabled?: boolean
  /**
   * "Cualquier profesional disponible" (P0.1). Cuando es true y hay serviceId sin
   * professionalId, la API itera TODOS los profesionales del servicio y devuelve
   * los huecos de cada uno por separado (sin colapsar por hora), de modo que el
   * hueco conserva su professional_id/professional_name. Sin esto, la RPC colapsa
   * a un hueco por hora (primer profesional libre).
   */
  allProfessionals?: boolean
}

export interface UseAvailabilityResult {
  daysShifts: Record<string, DayShifts>
  daysSummary: Record<string, DaySummary>
  isLoading: boolean
  isError: boolean
  refetch: () => void
  /** Helper para vista Día: huecos libres de una fecha (modo shifts). */
  shiftsForDate: (isoDate: string) => AvailabilityShift[]
  diagnostic?: { code: string; message: string } | null
}

export interface AvailabilityResponse {
  days: Record<string, DayShifts> | Record<string, DaySummary>
  diagnostic?: { code: string; message: string } | null
}

export interface FetchAvailabilityDaysParams {
  dateFrom: string
  dateTo: string
  serviceId?: string | null
  serviceIds?: string[] | null
  professionalId?: string | null
  summary?: boolean
  allProfessionals?: boolean
}

/**
 * Fetch IMPERATIVO (no-hook) a `/api/availability` — misma lógica de armado de
 * query params que `useAvailability` usa en su `queryFn`, extraída para
 * reusarla en consultas ONE-SHOT que no necesitan cache de react-query (ej. la
 * propuesta automática de fechas consecutivas de `MultiSessionScheduler`,
 * Pedido B ISADI 2026-07-14, que consulta un RANGO completo de una sola vez
 * en respuesta a un click, no de forma reactiva/declarativa).
 */
export async function fetchAvailabilityDays({
  dateFrom,
  dateTo,
  serviceId,
  serviceIds,
  professionalId,
  summary = false,
  allProfessionals = false,
}: FetchAvailabilityDaysParams): Promise<AvailabilityResponse> {
  const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo })
  // `serviceIds` (grupo) tiene prioridad sobre `serviceId` (puntual) — ver
  // comentario en UseAvailabilityOptions.
  if (serviceIds && serviceIds.length > 0) {
    params.set('service_ids', serviceIds.join(','))
  } else if (serviceId) {
    params.set('service_id', serviceId)
  }
  if (professionalId) params.set('professional_id', professionalId)
  if (summary) params.set('summary', 'true')
  if (allProfessionals) params.set('all_professionals', 'true')

  const res = await fetch(`/api/availability?${params.toString()}`)
  if (!res.ok) {
    throw new Error(`Error al obtener disponibilidad: ${res.status}`)
  }
  return (await res.json()) as AvailabilityResponse
}

export function useAvailability({
  dateFrom,
  dateTo,
  serviceId,
  serviceIds,
  professionalId,
  summary = false,
  enabled = true,
  allProfessionals = false,
}: UseAvailabilityOptions): UseAvailabilityResult {
  const query = useQuery<AvailabilityResponse>({
    queryKey: [
      'availability',
      dateFrom,
      dateTo,
      serviceIds && serviceIds.length > 0 ? serviceIds.slice().sort().join(',') : (serviceId ?? ''),
      professionalId ?? '',
      summary,
      allProfessionals,
    ],
    queryFn: () =>
      fetchAvailabilityDays({ dateFrom, dateTo, serviceId, serviceIds, professionalId, summary, allProfessionals }),
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
    diagnostic: query.data?.diagnostic ?? null,
  }
}
