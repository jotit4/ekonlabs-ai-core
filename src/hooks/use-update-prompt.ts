'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { UpdatePromptPayload } from '@/types/agente'

export function useUpdatePrompt() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (data: UpdatePromptPayload) => {
      const res = await fetch('/api/agente/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'update_failed')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agente', 'config'] })
      queryClient.invalidateQueries({ queryKey: ['agente', 'prompt-history'] })
      toast.success('Prompt guardado correctamente')
    },
    onError: (_error, variables) => {
      toast.error('Error al guardar.', {
        action: {
          label: 'Reintentar',
          onClick: () => mutation.mutate(variables),
        },
      })
    },
  })

  return mutation
}
