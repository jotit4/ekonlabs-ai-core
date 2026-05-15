'use client'

import { useQuery } from '@tanstack/react-query'

export interface Professional {
  professional_id: string
  name: string
}

interface ProfesionalesResponse {
  data: Professional[]
}

export function useProfesionales() {
  const { data, isPending, isError } = useQuery<Professional[]>({
    queryKey: ['profesionales'],
    queryFn: async () => {
      const res = await fetch('/api/profesionales')
      if (!res.ok) throw new Error('Error al obtener profesionales')
      const json = (await res.json()) as ProfesionalesResponse
      return json.data
    },
    staleTime: 60_000,
    retry: 1,
  })

  return {
    profesionales: data ?? [],
    isPending,
    isError,
  }
}
