'use client'

import { useEffect, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { parseJwtPayload } from '@/lib/utils/jwt'
import type { UserRole } from '@/types'

export function useUserRole(): UserRole | null {
  const [role, setRole] = useState<UserRole | null>(null)

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        const claims = parseJwtPayload(session.access_token)
        const claimedRole = (claims?.app_role ?? claims?.role) as UserRole | undefined
        setRole(claimedRole ?? null)
      }
    })
  }, [])

  return role
}
