'use client'

import { useEffect, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

/**
 * Devuelve el user.id de Supabase Auth del usuario autenticado actual.
 * Usado para saber si una nota es propia (author_user === currentUserId).
 */
export function useCurrentUserId(): string | null {
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null)
    })
  }, [])

  return userId
}
