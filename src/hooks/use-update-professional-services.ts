'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

interface UpdateProfessionalServicesArgs {
  id: string
  service_ids: string[]
}

export function useUpdateProfessionalServices() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({ id, service_ids }: UpdateProfessionalServicesArgs) => {
      const res = await fetch(`/api/profesionales/${id}/servicios`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_ids }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'update_services_failed')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profesionales', 'list'] })
    },
    onError: () => {
      toast.error('Error al actualizar los servicios del profesional. Intentá de nuevo.')
    },
  })

  return mutation
}
