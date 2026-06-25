'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'

export interface SendMessagePayload {
  /** Texto del mensaje. Requerido si no hay adjuntos. */
  content: string
  /** Archivos adjuntos opcionales. Si se incluyen, se envía como multipart/form-data. */
  attachments?: File[]
}

export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({ content, attachments }: SendMessagePayload) => {
      const endpoint = `/api/chatwoot/conversations/${conversationId}/messages/send`
      let res: Response

      if (attachments && attachments.length > 0) {
        // Con adjuntos: enviar multipart/form-data
        const form = new FormData()
        if (content.trim()) {
          form.append('content', content.trim())
        }
        for (const file of attachments) {
          form.append('attachments', file)
        }
        res = await fetch(endpoint, { method: 'POST', body: form })
      } else {
        // Solo texto: JSON (compatibilidad hacia atrás)
        res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        })
      }

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
    sendMessage: (content: string, attachments?: File[]) =>
      mutation.mutate({ content, attachments }),
    isPending: mutation.isPending,
    isError: mutation.isError,
    reset: mutation.reset,
  }
}
