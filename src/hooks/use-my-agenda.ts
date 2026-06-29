'use client'

import { useQuery } from '@tanstack/react-query'
import { useUserRole } from '@/hooks/use-user-role'
import type { Appointment } from '@/types/appointments'

export interface UseMyAgendaResult {
  appointments: Appointment[]
  isPending: boolean
  isError: boolean
  errorStatus: number | null
  refetch: () => void
}

export function useMyAgenda(isoDate: string): UseMyAgendaResult {
  // Solo los usuarios con rol 'doctor' tienen una agenda propia.
  // role === null = sesión aún cargando; role !== 'doctor' = no hay agenda.
  const role = useUserRole()
  const isDoctorRole = role === 'doctor'

  const query = useQuery({
    queryKey: ['mi-agenda', isoDate],
    queryFn: async () => {
      const res = await fetch(`/api/appointments/mi-agenda?fecha=${isoDate}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        const err = new Error(body.error ?? 'fetch_failed') as Error & { status: number }
        err.status = res.status
        throw err
      }
      const data = await res.json() as { data: Appointment[] }
      return data.data
    },
    staleTime: 0,
    retry: 1,
    // Gateo por rol: evita el 404/403 costoso en admin y recepcionistas.
    // El fetch solo se dispara cuando el rol ya cargó Y es 'doctor'.
    enabled: isDoctorRole,
  })

  // Rol cargado y no es doctor → sin agenda propia, sin HTTP round-trip.
  // Devolvemos isError:true + errorStatus:404 para que los componentes que
  // usan `sinAgendaPropia = isError && errorStatus === 404` sigan funcionando
  // sin cambios (mismo UX, sin llamada al servidor).
  if (role !== null && !isDoctorRole) {
    return {
      appointments: [],
      isPending: false,
      isError: true,
      errorStatus: 404,
      refetch: query.refetch,
    }
  }

  const errorStatus =
    query.error instanceof Error && 'status' in query.error
      ? (query.error as Error & { status: number }).status
      : null

  return {
    appointments: query.data ?? [],
    // isPending es true mientras el rol carga (role === null) o mientras
    // la query aún no resolvió (doctores en su primer fetch).
    isPending: role === null || query.isPending,
    isError: query.isError,
    errorStatus,
    refetch: query.refetch,
  }
}
