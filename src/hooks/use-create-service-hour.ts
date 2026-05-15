'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { CreateServiceHourPayload } from '@/types/servicios'

export function useCreateServiceHour(serviceId: string) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (data: CreateServiceHourPayload) => {
      const res = await fetch(`/api/servicios/${serviceId}/horarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'create_failed')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servicios', serviceId, 'horarios'] })
      toast.success('Horario agregado correctamente')
    },
    onError: (_error, variables) => {
      toast.error('Error al agregar el horario. Intentá de nuevo.', {
        action: {
          label: 'Reintentar',
          onClick: () => mutation.mutate(variables),
        },
      })
    },
  })

  return mutation
}
