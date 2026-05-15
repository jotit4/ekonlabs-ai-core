'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

export function useDeleteServiceHour() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({ serviceId, hourId }: { serviceId: string; hourId: string }) => {
      const res = await fetch(`/api/servicios/${serviceId}/horarios/${hourId}`, {
        method: 'DELETE',
      })
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'delete_failed')
      }
    },
    onSuccess: (_data, { serviceId }) => {
      queryClient.invalidateQueries({ queryKey: ['servicios', serviceId, 'horarios'] })
      toast.success('Horario eliminado')
    },
    onError: (_error, variables) => {
      toast.error('Error al eliminar el horario. Intentá de nuevo.', {
        action: {
          label: 'Reintentar',
          onClick: () => mutation.mutate(variables),
        },
      })
    },
  })

  return mutation
}
