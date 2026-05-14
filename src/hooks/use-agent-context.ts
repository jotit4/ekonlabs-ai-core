'use client'

import { useQuery } from '@tanstack/react-query'
import type { AgentContext } from '@/types/conversations'

export function useAgentContext(phone: string) {
  const { data, isLoading, isError } = useQuery<{ context: AgentContext | null }>({
    queryKey: ['agent-context', phone],
    queryFn: async () => {
      const res = await fetch(`/api/conversaciones/${phone}/context`)
      if (!res.ok) throw new Error('agent_context_unavailable')
      return res.json() as Promise<{ context: AgentContext | null }>
    },
    staleTime: 10_000,
    refetchInterval: 15_000,
    enabled: !!phone,
    retry: 1,
  })

  return {
    context: data?.context ?? null,
    isLoading,
    isError,
  }
}
