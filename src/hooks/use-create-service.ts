'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { CreateServicePayload } from '@/types/servicios'

export function useCreateService() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (payload: CreateServicePayload) => {
      const res = await fetch('/api/servicios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'create_failed')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servicios', 'list'] })
      toast.success('Servicio creado correctamente')
    },
    onError: (_error, variables) => {
      toast.error('Error al crear el servicio. Intentá de nuevo.', {
        action: {
          label: 'Reintentar',
          onClick: () => mutation.mutate(variables),
        },
      })
    },
  })

  return mutation
}
