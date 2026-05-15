'use client'

import { useEffect, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { parseJwtPayload } from '@/lib/utils/jwt'
import type { UserRole } from '@/types/index'

export function useCurrentTenant() {
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const claims = parseJwtPayload(session?.access_token ?? '')
      setTenantId((claims?.tenant_id as string) ?? null)
      setRole(((claims?.app_role ?? claims?.role) as UserRole) ?? null)
      setLoading(false)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  return { tenantId, role, loading }
}
