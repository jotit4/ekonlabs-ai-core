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
        () => queryClient.invalidateQueries({ queryKey: ['agenda', 'day', isoDate] }),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isoDate, queryClient])
}
