'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

/**
 * Suscribe a INSERTs en la tabla `conversations` para un phone_number específico.
 * Cuando el agente guarda un mensaje en Supabase, invalida inmediatamente la query
 * de mensajes de Chatwoot — evitando esperar el ciclo de polling de 10s.
 */
export function useConversationThreadRealtime(phone: string) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!phone) return

    const supabase = createSupabaseBrowserClient()
    let mounted = true

    const channel = supabase
      .channel(`conversation-thread-${phone}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversations',
          filter: `phone_number=eq.${phone}`,
        },
        () => {
          if (!mounted) return
          queryClient.invalidateQueries({ queryKey: ['chatwoot', 'messages', phone] })
        },
      )
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [phone, queryClient])
}
