'use client'

import { useReducer, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { startOfDay, endOfDay, parseISO, isValid } from 'date-fns'
import { formatISO } from 'date-fns'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { AuditLogEntry, AuditFilters } from '@/types/audit'

const PAGE_SIZE = 50

// ── Pagination reducer that auto-resets page when filtersKey changes ──────────

interface PaginationState {
  page: number
  filtersKey: string
}

type PaginationAction =
  | { type: 'SET_PAGE'; page: number }
  | { type: 'SYNC_FILTERS'; filtersKey: string }

function paginationReducer(state: PaginationState, action: PaginationAction): PaginationState {
  switch (action.type) {
    case 'SET_PAGE':
      return { ...state, page: action.page }
    case 'SYNC_FILTERS':
      if (state.filtersKey === action.filtersKey) return state
      return { page: 0, filtersKey: action.filtersKey }
    default:
      return state
  }
}

export function useAuditLog(filters: AuditFilters = {}) {
  const supabase = createSupabaseBrowserClient()
  const filtersKey = JSON.stringify(filters)

  const [pagination, dispatch] = useReducer(paginationReducer, {
    page: 0,
    filtersKey,
  })

  // Fix C-12: mover dispatch a useEffect para evitar side effects durante el render
  // El reducer tiene la guard: si filtersKey no cambió, retorna el estado sin cambios
  const page = pagination.page

  useEffect(() => {
    dispatch({ type: 'SYNC_FILTERS', filtersKey })
  }, [filtersKey])

  function setPage(updater: number | ((prev: number) => number)) {
    const newPage = typeof updater === 'function' ? updater(page) : updater
    dispatch({ type: 'SET_PAGE', page: newPage })
  }

  const logsQuery = useQuery({
    queryKey: ['audit_logs', 'list', page, filters],
    queryFn: async () => {
      const from = page * PAGE_SIZE
      const to = (page + 1) * PAGE_SIZE - 1

      let query = supabase
        .from('audit_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })

      if (filters.action) {
        query = query.eq('action', filters.action)
      }
      if (filters.userId) {
        query = query.eq('user_id', filters.userId)
      }
      if (filters.dateFrom) {
        const parsed = parseISO(filters.dateFrom)
        if (isValid(parsed)) {
          query = query.gte('created_at', formatISO(startOfDay(parsed)))
        }
      }
      if (filters.dateTo) {
        const parsed = parseISO(filters.dateTo)
        if (isValid(parsed)) {
          query = query.lte('created_at', formatISO(endOfDay(parsed)))
        }
      }

      const { data, error, count } = await query.range(from, to)
      if (error) throw error
      return { logs: (data ?? []) as AuditLogEntry[], total: count ?? 0 }
    },
    staleTime: 0,
  })

  // Segunda query: resolver user_ids a full_name para los logs mostrados
  const userIds = [...new Set((logsQuery.data?.logs ?? []).map((l) => l.user_id))]
  const usersQuery = useQuery({
    queryKey: ['audit_logs', 'users', userIds],
    queryFn: async () => {
      if (userIds.length === 0) return {}
      const { data } = await supabase
        .from('dashboard_users')
        .select('user_id, full_name')
        .in('user_id', userIds)
      const map: Record<string, string> = {}
      for (const u of data ?? []) {
        if (u.user_id && u.full_name) map[u.user_id] = u.full_name
      }
      return map
    },
    enabled: userIds.length > 0,
    staleTime: 5 * 60 * 1000,
  })

  // Tercera query: todos los usuarios del tenant para el dropdown de filtro
  const allUsersQuery = useQuery({
    queryKey: ['dashboard_users', 'all-for-filter'],
    queryFn: async () => {
      const { data } = await supabase
        .from('dashboard_users')
        .select('user_id, full_name, is_active')
        .order('full_name', { ascending: true })
      return (data ?? []) as { user_id: string; full_name: string; is_active: boolean }[]
    },
    staleTime: 5 * 60 * 1000,
  })

  const totalPages = Math.ceil((logsQuery.data?.total ?? 0) / PAGE_SIZE)

  return {
    logs: logsQuery.data?.logs ?? [],
    userMap: usersQuery.data ?? {},
    allUsers: allUsersQuery.data ?? [],
    total: logsQuery.data?.total ?? 0,
    totalPages,
    page,
    setPage,
    isPending: logsQuery.isPending,
    isError: logsQuery.isError,
    refetch: logsQuery.refetch,
  }
}
