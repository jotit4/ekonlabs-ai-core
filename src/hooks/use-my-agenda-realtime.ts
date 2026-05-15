'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { parseJwtPayload } from '@/lib/utils/jwt'

export function useMyAgendaRealtime(isoDate: string) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    let mounted = true
    let channel: ReturnType<typeof supabase.channel> | null = null

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      const claims = parseJwtPayload(session?.access_token ?? '')
      const tenantId = claims?.tenant_id as string | undefined

      if (!tenantId) return

      channel = supabase
        .channel(`appointments-mi-agenda-${isoDate}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'appointments',
            filter: `tenant_id=eq.${tenantId}`,
          },
          (payload) => {
            const newRecord = payload.new as Record<string, string> | undefined
            const oldRecord = payload.old as Record<string, string> | undefined
            const affectedTime = newRecord?.start_at ?? oldRecord?.start_at
            if (affectedTime && affectedTime.slice(0, 10) !== isoDate) return
            queryClient.invalidateQueries({ queryKey: ['mi-agenda', isoDate] })
          },
        )
        .subscribe()
    })

    return () => {
      mounted = false
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [isoDate, queryClient])
}
