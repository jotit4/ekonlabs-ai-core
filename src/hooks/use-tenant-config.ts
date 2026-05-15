'use client'

import { useQuery } from '@tanstack/react-query'

interface TenantConfigResponse {
  uses_native_calendar: boolean
}

export function useTenantConfig() {
  const { data, isPending } = useQuery<TenantConfigResponse>({
    queryKey: ['tenant', 'config'],
    queryFn: async () => {
      const res = await fetch('/api/tenant/config')
      if (!res.ok) throw new Error('Error al obtener config del tenant')
      return res.json() as Promise<TenantConfigResponse>
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  return {
    usesNativeCalendar: data?.uses_native_calendar ?? false,
    isPending,
  }
}
