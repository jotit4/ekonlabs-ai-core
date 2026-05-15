'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

export function useDeleteServiceException() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({ serviceId, exceptionId }: { serviceId: string; exceptionId: string }) => {
      const res = await fetch(`/api/servicios/${serviceId}/excepciones/${exceptionId}`, {
        method: 'DELETE',
      })
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'delete_failed')
      }
    },
    onSuccess: (_data, { serviceId }) => {
      queryClient.invalidateQueries({ queryKey: ['servicios', serviceId, 'excepciones'] })
      toast.success('Excepción eliminada')
    },
    onError: (_error, variables) => {
      toast.error('Error al eliminar la excepción. Intentá de nuevo.', {
        action: {
          label: 'Reintentar',
          onClick: () => mutation.mutate(variables),
        },
      })
    },
  })

  return mutation
}
