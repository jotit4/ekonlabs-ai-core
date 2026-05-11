'use client'

import { useState, useEffect, useCallback } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { DashboardUser } from '@/types/index'

interface UseUserManagementReturn {
  users: DashboardUser[]
  isLoading: boolean
  isError: boolean
  refetch: () => void
  toggleUserStatus: (userId: string, newStatus: boolean) => Promise<void>
  isToggling: string | null
  currentUserId: string | null
}

export function useUserManagement(): UseUserManagementReturn {
  const [users, setUsers] = useState<DashboardUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isError, setIsError] = useState(false)
  const [isToggling, setIsToggling] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [refetchKey, setRefetchKey] = useState(0)

  // Obtener el user_id del usuario actual desde el JWT
  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) {
        setCurrentUserId(session.user.id)
      }
    })
  }, [])

  // Cargar lista de usuarios
  useEffect(() => {
    let cancelled = false
    const timeoutId = setTimeout(() => {
      if (!cancelled) setIsError(true)
    }, 5000)

    const fetchUsers = async () => {
      setIsLoading(true)
      setIsError(false)

      try {
        const supabase = createSupabaseBrowserClient()
        const { data, error } = await supabase
          .from('dashboard_users')
          .select('*')
          .order('created_at', { ascending: true })

        clearTimeout(timeoutId)

        if (cancelled) return

        if (error) {
          setIsError(true)
        } else {
          setUsers((data as DashboardUser[]) ?? [])
        }
      } catch {
        if (!cancelled) {
          clearTimeout(timeoutId)
          setIsError(true)
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    fetchUsers()

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [refetchKey])

  const refetch = useCallback(() => {
    setRefetchKey((k) => k + 1)
  }, [])

  const toggleUserStatus = useCallback(async (userId: string, newStatus: boolean) => {
    setIsToggling(userId)
    try {
      const response = await fetch(`/api/usuarios/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: newStatus }),
      })

      if (response.ok) {
        // Actualizar optimisticamente la lista local
        setUsers((prev) =>
          prev.map((u) =>
            u.user_id === userId ? { ...u, is_active: newStatus } : u
          )
        )
      }
    } catch {
      // Error silencioso — la UI mostrará el estado previo
    } finally {
      setIsToggling(null)
    }
  }, [])

  return {
    users,
    isLoading,
    isError,
    refetch,
    toggleUserStatus,
    isToggling,
    currentUserId,
  }
}
