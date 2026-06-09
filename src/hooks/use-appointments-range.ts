'use client'

import { useList } from '@refinedev/core'
import { startOfDay, endOfDay, formatISO, parseISO } from 'date-fns'
import type { Appointment } from '@/types/appointments'

export interface UseAppointmentsRangeOptions {
  professionalId?: string | null
  serviceId?: string | null
}

export interface UseAppointmentsRangeResult {
  appointments: Appointment[]
  isLoading: boolean
  isError: boolean
  refetch: () => void
}

export function useAppointmentsRange(
  dateFrom: string, // ISO date: 'YYYY-MM-DD'
  dateTo: string,   // ISO date: 'YYYY-MM-DD'
  options?: UseAppointmentsRangeOptions,
): UseAppointmentsRangeResult {
  const { professionalId, serviceId } = options ?? {}

  const startISO = formatISO(startOfDay(parseISO(dateFrom)))
  const endISO = formatISO(endOfDay(parseISO(dateTo)))

  const { query, result } = useList<Appointment>({
    resource: 'appointments',
    meta: {
      select: '*, reminder_sent_at, attendance_confirmed, package_id, session_index, treatments(total_sessions, status), patients(full_name), services(name, professional_name, duration_minutes), professionals(name)',
    },
    filters: [
      { field: 'start_at', operator: 'gte', value: startISO },
      { field: 'start_at', operator: 'lte', value: endISO },
      ...(professionalId ? [{ field: 'professional_id', operator: 'eq' as const, value: professionalId }] : []),
      ...(serviceId ? [{ field: 'service_id', operator: 'eq' as const, value: serviceId }] : []),
    ],
    sorters: [{ field: 'start_at', order: 'asc' }],
    pagination: { mode: 'off' },
    queryOptions: {
      queryKey: ['agenda', 'range', dateFrom, dateTo, professionalId ?? '', serviceId ?? ''],
      staleTime: 2 * 60_000,
    },
  })

  return {
    appointments: (result?.data ?? []) as Appointment[],
    isLoading: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
  }
}
