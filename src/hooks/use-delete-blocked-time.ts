'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

export function useDeleteBlockedTime() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({ professionalId, blockId }: { professionalId: string; blockId: string }) => {
      const res = await fetch(`/api/profesionales/${professionalId}/bloqueos/${blockId}`, {
        method: 'DELETE',
      })
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'delete_failed')
      }
    },
    onSuccess: (_data, { professionalId }) => {
      queryClient.invalidateQueries({ queryKey: ['profesionales', professionalId, 'bloqueos'] })
      toast.success('Bloqueo eliminado')
    },
    onError: (_error, variables) => {
      toast.error('Error al eliminar el bloqueo. Intentá de nuevo.', {
        action: {
          label: 'Reintentar',
          onClick: () => mutation.mutate(variables),
        },
      })
    },
  })

  return mutation
}
