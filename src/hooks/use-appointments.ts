'use client'

import { useList } from '@refinedev/core'
import { startOfDay, endOfDay, formatISO, parseISO } from 'date-fns'
import type { Appointment } from '@/types/appointments'

export interface UseAppointmentsOptions {
  professionalId?: string | null
  serviceId?: string | null
}

export interface UseAppointmentsResult {
  appointments: Appointment[]
  isLoading: boolean
  isError: boolean
  refetch: () => void
  overtime: { elapsedTime?: number | undefined }
  professionalId?: string | null
  serviceId?: string | null
}

export function useAppointments(
  isoDate: string,
  options?: UseAppointmentsOptions,
): UseAppointmentsResult {
  const { professionalId, serviceId } = options ?? {}
  const selectedDate = parseISO(isoDate)
  const startISO = formatISO(startOfDay(selectedDate))
  const endISO = formatISO(endOfDay(selectedDate))

  const { query, result, overtime } = useList<Appointment>({
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
      queryKey: ['agenda', 'day', isoDate, professionalId ?? '', serviceId ?? ''],
      staleTime: 60_000,
    },
    overtimeOptions: { interval: 100 },
  })

  const timedOut = (overtime.elapsedTime ?? 0) >= 10000

  return {
    appointments: (result?.data ?? []) as Appointment[],
    isLoading: query.isPending && !timedOut,
    isError: query.isError || timedOut,
    refetch: query.refetch,
    overtime,
    professionalId,
    serviceId,
  }
}
