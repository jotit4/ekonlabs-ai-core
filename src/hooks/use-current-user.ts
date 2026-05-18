'use client'

import { useEffect, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { parseJwtPayload } from '@/lib/utils/jwt'
import type { UserRole } from '@/types'

export interface CurrentUser {
  fullName: string
  email: string
  role: UserRole
  initials: string
}

export interface UseCurrentUserResult {
  user: CurrentUser | null
  isLoading: boolean
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

export function useCurrentUser(): UseCurrentUserResult {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) {
        setIsLoading(false)
        return
      }
      const claims = parseJwtPayload(session.access_token)
      const role = ((claims?.app_role ?? claims?.role) as UserRole) ?? 'receptionist'

      supabase
        .from('dashboard_users')
        .select('full_name, email')
        .eq('user_id', session.user.id)
        .single()
        .then(({ data, error }) => {
          if (error || !data) {
            // Fallback: usar email del objeto user de Supabase
            const fallbackEmail = session.user.email ?? ''
            const fallbackName = fallbackEmail.split('@')[0] || 'Usuario'
            setUser({
              fullName: fallbackName,
              email: fallbackEmail,
              role,
              initials: getInitials(fallbackName),
            })
          } else {
            const fullName = data.full_name || session.user.email?.split('@')[0] || 'Usuario'
            const email = data.email || session.user.email || ''
            setUser({
              fullName,
              email,
              role,
              initials: getInitials(fullName),
            })
          }
          setIsLoading(false)
        })
    })
  }, [])

  return { user, isLoading }
}
