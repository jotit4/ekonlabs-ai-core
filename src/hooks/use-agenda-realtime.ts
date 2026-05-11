'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export function useAgendaRealtime(isoDate: string) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    const channel = supabase
      .channel(`appointments-changes-${isoDate}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        (payload) => {
          const newRecord = payload.new as Record<string, string> | undefined
          const oldRecord = payload.old as Record<string, string> | undefined
          // CORRECCIÓN: usar start_at (columna real) en lugar de appointment_time (legacy)
          const affectedTime = newRecord?.start_at ?? oldRecord?.start_at
          if (affectedTime && affectedTime.slice(0, 10) !== isoDate) return
          queryClient.invalidateQueries({ queryKey: ['agenda', 'day', isoDate] })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isoDate, queryClient])
}
