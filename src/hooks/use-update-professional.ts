'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { UpdateProfessionalPayload } from '@/types/profesionales'

interface UpdateProfessionalArgs {
  id: string
  payload: UpdateProfessionalPayload
}

export function useUpdateProfessional() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({ id, payload }: UpdateProfessionalArgs) => {
      const res = await fetch(`/api/profesionales/${id}`, {
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
      queryClient.invalidateQueries({ queryKey: ['profesionales', 'list'] })
      toast.success('Profesional actualizado correctamente')
    },
    onError: (_error, variables) => {
      toast.error('Error al actualizar el profesional. Intentá de nuevo.', {
        action: {
          label: 'Reintentar',
          onClick: () => mutation.mutate(variables),
        },
      })
    },
  })

  return mutation
}
