'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

export function useMarkRead() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (phone: string) => {
      const res = await fetch(`/api/conversaciones/${encodeURIComponent(phone)}/read`, {
        method: 'POST',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'mark_read_failed')
      }
      return res.json()
    },
    onSuccess: () => {
      // Invalidar la lista para que el indicador de no leído desaparezca
      queryClient.invalidateQueries({ queryKey: ['conversations', 'list'] })
    },
    onError: () => {
      toast.error('No se pudo marcar como leída. Intentá de nuevo.', {
        action: {
          label: 'Reintentar',
          onClick: () => mutation.mutate(mutation.variables ?? ''),
        },
      })
    },
  })

  return {
    markRead: mutation.mutate,
    isPending: mutation.isPending,
  }
}
