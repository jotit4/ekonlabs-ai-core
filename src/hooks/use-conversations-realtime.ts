'use client'

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { parseJwtPayload } from '@/lib/utils/jwt'

export function useConversationsRealtime() {
  const queryClient = useQueryClient()
  const [isConnected, setIsConnected] = useState(false) // Fix M-24: inicia en false

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    let mounted = true
    let channel: ReturnType<typeof supabase.channel> | null = null

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return // Componente ya desmontado, no crear canal
      const claims = parseJwtPayload(session?.access_token ?? '')
      const tenantId = claims?.tenant_id as string | undefined

      if (!tenantId) return // No crear canal si no hay tenantId

      channel = supabase
        .channel('conversations-realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'thread_states',
            filter: `tenant_id=eq.${tenantId}`, // Fix C-04
          },
          () => {
            queryClient.invalidateQueries({ queryKey: ['conversations', 'list'] })
          },
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'conversations',
            filter: `tenant_id=eq.${tenantId}`, // Fix C-04
          },
          () => {
            queryClient.invalidateQueries({ queryKey: ['conversations', 'list'] })
          },
        )
        .subscribe((status) => {
          setIsConnected(status === 'SUBSCRIBED')
        })
    })

    return () => {
      mounted = false
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [queryClient])

  return { isConnected }
}
