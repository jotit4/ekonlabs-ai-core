'use client'

import { useList } from '@refinedev/core'
import { startOfDay, endOfDay, formatISO, parseISO } from 'date-fns'
import type { Appointment } from '@/types/appointments'

export interface UseAppointmentsResult {
  appointments: Appointment[]
  isLoading: boolean
  isError: boolean
  refetch: () => void
  overtime: { elapsedTime?: number | undefined }
}

export function useAppointments(isoDate: string): UseAppointmentsResult {
  const selectedDate = parseISO(isoDate)
  const startISO = formatISO(startOfDay(selectedDate))
  const endISO = formatISO(endOfDay(selectedDate))

  const { query, result, overtime } = useList<Appointment>({
    resource: 'appointments',
    meta: {
      select: '*, patients(full_name), services(name, professional_name, duration_minutes)',
    },
    filters: [
      { field: 'start_at', operator: 'gte', value: startISO },
      { field: 'start_at', operator: 'lte', value: endISO },
    ],
    sorters: [{ field: 'start_at', order: 'asc' }],
    pagination: { mode: 'off' },
    queryOptions: {
      queryKey: ['agenda', 'day', isoDate],
      staleTime: 0,
    },
    overtimeOptions: { interval: 100 },
  })

  const timedOut = (overtime.elapsedTime ?? 0) >= 5000

  return {
    appointments: (result?.data ?? []) as Appointment[],
    isLoading: query.isPending && !timedOut,
    isError: query.isError || timedOut,
    refetch: query.refetch,
    overtime,
  }
}
