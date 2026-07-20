'use client'

import { useEffect } from 'react'
import { useList } from '@refinedev/core'
import { useQueryClient } from '@tanstack/react-query'
import { startOfDay, endOfDay, formatISO, parseISO } from 'date-fns'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { parseJwtPayload } from '@/lib/utils/jwt'
import type { Appointment } from '@/types/appointments'

// Story 16.1 — cola de orden de llegada (walk-in) de un servicio, para HOY.
// Lista solo los walk-ins vigentes (is_walk_in=true, status='confirmed') del
// servicio, ordenados por hora de llegada (start_at asc). Trae su propia
// suscripción realtime porque /recepcion NO monta useAgendaRealtime.

export interface UseWalkInQueueResult {
  queue: Appointment[]
  isLoading: boolean
  isError: boolean
  refetch: () => void
}

export function useWalkInQueue(isoDate: string, serviceId: string): UseWalkInQueueResult {
  const queryClient = useQueryClient()
  const selectedDate = parseISO(isoDate)
  const startISO = formatISO(startOfDay(selectedDate))
  const endISO = formatISO(endOfDay(selectedDate))

  const { query, result } = useList<Appointment>({
    resource: 'appointments',
    meta: {
      select:
        'appointment_id, start_at, patient_id, service_id, professional_id, patients(full_name)',
    },
    filters: [
      { field: 'is_walk_in', operator: 'eq', value: true },
      { field: 'status', operator: 'eq', value: 'confirmed' },
      { field: 'service_id', operator: 'eq', value: serviceId },
      { field: 'start_at', operator: 'gte', value: startISO },
      { field: 'start_at', operator: 'lte', value: endISO },
    ],
    sorters: [{ field: 'start_at', order: 'asc' }],
    pagination: { mode: 'off' },
    queryOptions: {
      queryKey: ['walk-in-queue', isoDate, serviceId],
      staleTime: 30_000,
      enabled: !!serviceId,
    },
  })

  // Realtime propio: /recepcion no monta useAgendaRealtime, así que la cola
  // necesita su propia fuente de refresco en vivo. Canal filtrado por tenant
  // (mismo patrón que use-agenda-realtime), invalidando ['walk-in-queue'].
  useEffect(() => {
    // Sin servicio no hay cola que escuchar (la query también está deshabilitada
    // con enabled:!!serviceId): no abrimos un canal realtime inútil.
    if (!serviceId) return

    const supabase = createSupabaseBrowserClient()
    let mounted = true
    let channel: ReturnType<typeof supabase.channel> | null = null

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      const claims = parseJwtPayload(session?.access_token ?? '')
      const tenantId = claims?.tenant_id as string | undefined
      if (!tenantId) return

      channel = supabase
        .channel(`walk-in-queue-${isoDate}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'appointments',
            filter: `tenant_id=eq.${tenantId}`,
          },
          () => {
            queryClient.invalidateQueries({ queryKey: ['walk-in-queue'], exact: false })
          },
        )
        .subscribe()
    })

    return () => {
      mounted = false
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [isoDate, serviceId, queryClient])

  return {
    queue: (result?.data ?? []) as Appointment[],
    isLoading: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
  }
}
