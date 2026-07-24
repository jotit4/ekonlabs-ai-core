'use client'

import { useEffect, useMemo } from 'react'
import { useList } from '@refinedev/core'
import { useQueryClient } from '@tanstack/react-query'
import { startOfDay, endOfDay, formatISO, parseISO } from 'date-fns'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { parseJwtPayload } from '@/lib/utils/jwt'
import type { Appointment } from '@/types/appointments'

// Story 16.1 — cola de orden de llegada (walk-in) de un servicio, para HOY.
// Trae su propia suscripción realtime porque /recepcion NO monta
// useAgendaRealtime.
//
// Pedido ISADI 2026-07-24: al marcar "Atendido" el paciente ya NO desaparece de
// la lista, baja al bloque de ATENDIDOS. Por eso la query trae los walk-ins de
// hoy con status IN ('confirmed', 'completed') — los pendientes y los ya
// atendidos. Quedan afuera 'cancelled' y 'no_show' (esos sí desaparecen).
//
// El orden que devuelve el hook es el ORDEN DE LLEGADA REAL (start_at asc): el
// primero que llegó es el primer elemento. La UI lo invierte para mostrarlo
// (LIFO) pero numera con este orden, así el número de cada fila es estable.

export interface UseWalkInQueueResult {
  /** Walk-ins de hoy (pendientes + atendidos) en orden de llegada real (asc). */
  queue: Appointment[]
  isLoading: boolean
  isError: boolean
  refetch: () => void
  /**
   * Instante (ms) del último fetch exitoso. El panel lo usa para saber cuándo
   * caducó una marca optimista: si el dato del servidor es POSTERIOR a la marca
   * y sigue sin decir 'completed', la marca ya no vale.
   */
  dataUpdatedAt: number
}

// Estados que siguen en la cola del día. 'cancelled' / 'no_show' quedan afuera
// a propósito: esos sí se van de la lista.
const ESTADOS_EN_COLA = ['confirmed', 'completed'] as const

export function useWalkInQueue(isoDate: string, serviceId: string): UseWalkInQueueResult {
  const queryClient = useQueryClient()
  const selectedDate = parseISO(isoDate)
  const startISO = formatISO(startOfDay(selectedDate))
  const endISO = formatISO(endOfDay(selectedDate))

  const { query, result } = useList<Appointment>({
    resource: 'appointments',
    meta: {
      // `status` es imprescindible: la UI separa "Esperando" de "Atendidos" con él.
      select:
        'appointment_id, start_at, status, patient_id, service_id, professional_id, patients(full_name)',
    },
    filters: [
      { field: 'is_walk_in', operator: 'eq', value: true },
      // operator 'in' → PostgREST `status=in.(confirmed,completed)`
      // (@refinedev/supabase lo mapea a query.in(field, value)).
      { field: 'status', operator: 'in', value: [...ESTADOS_EN_COLA] },
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

  // Referencia estable: el panel deriva memos y corre un effect de limpieza del
  // estado optimista sobre `queue`; un array nuevo en cada render lo dispararía
  // sin parar.
  const queue = useMemo(() => (result?.data ?? []) as Appointment[], [result?.data])

  return {
    queue,
    isLoading: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
    dataUpdatedAt: query.dataUpdatedAt ?? 0,
  }
}
