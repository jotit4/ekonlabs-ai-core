'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { CreateBlockedTimePayload } from '@/types/profesionales-horarios'

export function useCreateBlockedTime(professionalId: string) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (data: CreateBlockedTimePayload) => {
      const res = await fetch(`/api/profesionales/${professionalId}/bloqueos`, {
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
      queryClient.invalidateQueries({ queryKey: ['profesionales', professionalId, 'bloqueos'] })
      toast.success('Período bloqueado registrado')
    },
    onError: (_error, variables) => {
      toast.error('Error al registrar el bloqueo. Intentá de nuevo.', {
        action: {
          label: 'Reintentar',
          onClick: () => mutation.mutate(variables),
        },
      })
    },
  })

  return mutation
}
