'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'

export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({ content }: { content: string }) => {
      const res = await fetch(
        `/api/chatwoot/conversations/${conversationId}/messages/send`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        }
      )
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'chatwoot_unavailable')
      }
      return res.json()
    },
    onSuccess: () => {
      // Invalidar cache de mensajes para refrescar el hilo con el nuevo mensaje
      void queryClient.invalidateQueries({
        queryKey: ['chatwoot', 'messages', conversationId],
      })
    },
    // onError: NO hacer toast — el componente maneja el feedback inline (UX-DR18)
  })

  return {
    sendMessage: (content: string) => mutation.mutate({ content }),
    isPending: mutation.isPending,
    isError: mutation.isError,
    reset: mutation.reset,
  }
}
