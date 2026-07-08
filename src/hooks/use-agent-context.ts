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
    // El contexto del agente no cambia cada 15s; 60s alcanza y baja los polls 4x.
    // React Query ya pausa el timer cuando la pestaña no está enfocada
    // (refetchIntervalInBackground: false por defecto).
    refetchInterval: 60_000,
    enabled: !!phone,
    retry: 1,
  })

  return {
    context: data?.context ?? null,
    isLoading,
    isError,
  }
}
