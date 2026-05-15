'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { parseJwtPayload } from '@/lib/utils/jwt'

export function useAgendaRealtime(isoDate: string) {
  const queryClient = useQueryClient()

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
        .channel(`appointments-changes-${isoDate}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'appointments',
            filter: `tenant_id=eq.${tenantId}`, // Fix C-04
          },
          (payload) => {
            const newRecord = payload.new as Record<string, string> | undefined
            const oldRecord = payload.old as Record<string, string> | undefined
            const affectedTime = newRecord?.start_at ?? oldRecord?.start_at

            // Invalidar vista día solo si el evento corresponde a isoDate
            if (!affectedTime || affectedTime.slice(0, 10) === isoDate) {
              queryClient.invalidateQueries({ queryKey: ['agenda', 'day', isoDate], exact: false })
            }

            // Invalidar vistas de rango siempre — cualquier cambio del tenant puede
            // pertenecer a la semana/mes actualmente visible
            queryClient.invalidateQueries({ queryKey: ['agenda', 'range'], exact: false })
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
