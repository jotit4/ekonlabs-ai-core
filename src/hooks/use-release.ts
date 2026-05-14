'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { ConversationSummary } from '@/types/conversations'

export function useRelease(phone: string) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/conversaciones/${phone}/release`, {
        method: 'POST',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'release_failed')
      }
      return res.json()
    },
    onMutate: async () => {
      // Cancelar queries en curso para evitar sobrescribir el optimistic update
      await queryClient.cancelQueries({ queryKey: ['conversations', 'list'] })

      // Snapshot del estado anterior (para rollback en caso de error)
      const previousConversations = queryClient.getQueriesData<ConversationSummary[]>({
        queryKey: ['conversations', 'list'],
      })

      // Optimistic update: cambiar estado a ai_active inmediatamente
      queryClient.setQueriesData<ConversationSummary[]>(
        { queryKey: ['conversations', 'list'] },
        (old) => old?.map((conv) =>
          conv.phone_number === phone
            ? { ...conv, status: 'ai_active' as const }
            : conv
        )
      )

      return { previousConversations }
    },
    onError: (err, _variables, context) => {
      // Rollback al estado anterior
      if (context?.previousConversations) {
        for (const [queryKey, data] of context.previousConversations) {
          queryClient.setQueryData(queryKey, data)
        }
      }

      toast.error('Error al liberar al agente. Intentá de nuevo.', {
        action: {
          label: 'Reintentar',
          onClick: () => mutation.mutate(),
        },
      })
    },
    onSuccess: () => {
      // Refrescar bandeja con estado real del servidor
      queryClient.invalidateQueries({ queryKey: ['conversations', 'list'] })
      // Refrescar hilo para mostrar separador "Agente retomó el control"
      queryClient.invalidateQueries({ queryKey: ['chatwoot', 'messages', phone] })
      // Refrescar panel de contexto para reflejar que ya no hay human_takeover
      queryClient.invalidateQueries({ queryKey: ['agent-context', phone] })
    },
  })

  return {
    release: () => mutation.mutate(),
    isPending: mutation.isPending,
  }
}
