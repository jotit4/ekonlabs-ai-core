'use client'

import { useQuery } from '@tanstack/react-query'
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

async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const supabase = createSupabaseBrowserClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return null

  const claims = parseJwtPayload(session.access_token)
  const role = ((claims?.app_role ?? claims?.role) as UserRole) ?? 'receptionist'
  const { data, error } = await supabase
    .from('dashboard_users')
    .select('full_name, email')
    .eq('user_id', session.user.id)
    .single()

  if (error || !data) {
    const fallbackEmail = session.user.email ?? ''
    const fallbackName = fallbackEmail.split('@')[0] || 'Usuario'
    return {
      fullName: fallbackName,
      email: fallbackEmail,
      role,
      initials: getInitials(fallbackName),
    }
  }

  const fullName = data.full_name || session.user.email?.split('@')[0] || 'Usuario'
  const email = data.email || session.user.email || ''
  return {
    fullName,
    email,
    role,
    initials: getInitials(fullName),
  }
}

export function useCurrentUser(): UseCurrentUserResult {
  // AppSidebar monta el botón de perfil desktop y mobile simultáneamente, y las
  // landings también piden el usuario para el saludo. React Query comparte una
  // única promesa/lectura entre todos esos consumidores y entre navegaciones.
  const query = useQuery({
    queryKey: ['auth', 'current-user'],
    queryFn: fetchCurrentUser,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  })

  return { user: query.data ?? null, isLoading: query.isPending }
}
