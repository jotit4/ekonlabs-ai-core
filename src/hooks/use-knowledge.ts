'use client'

import { useQuery } from '@tanstack/react-query'
import type { KnowledgeEntry, KnowledgeListResponse } from '@/types/agente'

/**
 * Query de la base de conocimiento del agente (`GET /api/agente/knowledge`).
 * Devuelve la lista de entradas del tenant (el tenant lo resuelve el endpoint
 * server-side desde el JWT). Story 6.7.
 */
export function useKnowledge() {
  const query = useQuery<KnowledgeEntry[]>({
    queryKey: ['agente', 'knowledge'],
    queryFn: async () => {
      const response = await fetch('/api/agente/knowledge')
      if (!response.ok) {
        throw new Error(`Error al obtener la base de conocimiento: ${response.status}`)
      }
      const json = (await response.json()) as KnowledgeListResponse
      return json.entries ?? []
    },
    staleTime: 30 * 1000,
    retry: 1,
  })

  return {
    entries: query.data ?? [],
    isPending: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
  }
}
