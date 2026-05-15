'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { ConversationSummary } from '@/types/conversations'

export function useTakeover() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (phone: string) => {
      const res = await fetch(`/api/conversaciones/${phone}/takeover`, {
        method: 'POST',
      })
      if (!res.ok) {
        if (res.status === 409) {
          throw new Error('conflict')
        }
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'takeover_failed')
      }
      return res.json()
    },
    onMutate: async (phone: string) => {
      // Cancelar queries en curso para evitar sobrescribir el optimistic update
      await queryClient.cancelQueries({ queryKey: ['conversations', 'list'] })

      // Snapshot del estado anterior (para rollback en caso de error)
      const previousConversations = queryClient.getQueriesData<ConversationSummary[]>({
        queryKey: ['conversations', 'list'],
      })

      // Optimistic update: cambiar estado a human_takeover inmediatamente
      queryClient.setQueriesData<ConversationSummary[]>(
        { queryKey: ['conversations', 'list'] },
        (old) => old?.map((conv) =>
          conv.phone_number === phone
            ? { ...conv, status: 'human_takeover' as const }
            : conv
        )
      )

      return { previousConversations }
    },
    onError: (err, phone, context) => {
      // Rollback al estado anterior
      if (context?.previousConversations) {
        for (const [queryKey, data] of context.previousConversations) {
          queryClient.setQueryData(queryKey, data)
        }
      }

      if (err.message === 'conflict') {
        toast.warning('Esta conversación ya está siendo atendida por otro operador')
      } else {
        toast.error('Error al asumir control. Intentá de nuevo.', {
          action: {
            label: 'Reintentar',
            onClick: () => mutation.mutate(phone),
          },
        })
      }
    },
    onSuccess: () => {
      // Refrescar bandeja con estado real del servidor
      queryClient.invalidateQueries({ queryKey: ['conversations', 'list'] })
    },
  })

  return {
    takeover: mutation.mutate,
    isPending: mutation.isPending,
  }
}
