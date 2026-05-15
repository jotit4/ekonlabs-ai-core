'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { UpdateServicePayload } from '@/types/servicios'

interface UpdateServiceArgs {
  id: string
  payload: UpdateServicePayload
}

export function useUpdateService() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({ id, payload }: UpdateServiceArgs) => {
      const res = await fetch(`/api/servicios/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'update_failed')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servicios', 'list'] })
      toast.success('Servicio actualizado correctamente')
    },
    onError: (_error, variables) => {
      toast.error('Error al actualizar el servicio. Intentá de nuevo.', {
        action: {
          label: 'Reintentar',
          onClick: () => mutation.mutate(variables),
        },
      })
    },
  })

  return mutation
}
