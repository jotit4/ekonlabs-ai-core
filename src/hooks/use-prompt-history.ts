'use client'

import { useQuery } from '@tanstack/react-query'
import type { SystemPromptHistoryEntry } from '@/types/agente'

async function fetchPromptHistory(): Promise<SystemPromptHistoryEntry[]> {
  const res = await fetch('/api/agente/prompt-history')
  if (!res.ok) {
    throw new Error('Error al obtener historial')
  }
  const body = await res.json() as { data: SystemPromptHistoryEntry[] }
  return body.data
}

export function usePromptHistory() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['agente', 'prompt-history'],
    queryFn: fetchPromptHistory,
    staleTime: 30 * 1000,
    retry: 1,
  })

  return {
    history: data ?? [],
    isPending,
    isError,
    refetch,
  }
}
