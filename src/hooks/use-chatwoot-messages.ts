'use client'

import { useQuery } from '@tanstack/react-query'
import type { ChatwootMessage } from '@/types/conversations'

export function useChatwootMessages(conversationId: string) {
  const { data, isLoading, isError } = useQuery<{ messages: ChatwootMessage[] }>({
    queryKey: ['chatwoot', 'messages', conversationId],
    queryFn: async () => {
      const res = await fetch(`/api/chatwoot/conversations/${conversationId}/messages`)
      if (!res.ok) throw new Error('chatwoot_unavailable')
      return res.json() as Promise<{ messages: ChatwootMessage[] }>
    },
    staleTime: 0,
    enabled: !!conversationId,
    refetchInterval: 10_000, // Polling cada 10s — fallback siempre activo en MVP
    retry: 1,
  })

  // isConnected: false cuando hay error (Chatwoot no disponible)
  // En MVP con polling puro, el banner solo aparece si hay error real
  const isConnected = !isError

  return {
    messages: data?.messages ?? [],
    isConnected,
    isLoading,
    isError,
  }
}
