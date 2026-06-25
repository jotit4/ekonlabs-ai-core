'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { ConversationSummary } from '@/types/conversations'

export function useResolve() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({ phone, resolved }: { phone: string; resolved: boolean }) => {
      const res = await fetch(`/api/conversaciones/${encodeURIComponent(phone)}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'resolve_failed')
      }
      return res.json()
    },
    onMutate: async ({ phone, resolved }) => {
      await queryClient.cancelQueries({ queryKey: ['conversations', 'list'] })

      const previousConversations = queryClient.getQueriesData<ConversationSummary[]>({
        queryKey: ['conversations', 'list'],
      })

      // Optimistic update: cambiar el status inmediatamente
      queryClient.setQueriesData<ConversationSummary[]>(
        { queryKey: ['conversations', 'list'] },
        (old) =>
          old?.map((conv) =>
            conv.phone_number === phone
              ? { ...conv, status: resolved ? ('resolved' as const) : ('ai_active' as const) }
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
      toast.error('Error al actualizar la conversación. Intentá de nuevo.', {
        action: {
          label: 'Reintentar',
          onClick: () => mutation.mutate(mutation.variables ?? { phone: '', resolved: false }),
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations', 'list'] })
    },
  })

  return {
    resolve: (phone: string) => mutation.mutate({ phone, resolved: true }),
    reopen: (phone: string) => mutation.mutate({ phone, resolved: false }),
    isPending: mutation.isPending,
  }
}
