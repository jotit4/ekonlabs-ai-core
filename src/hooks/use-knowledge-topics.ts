'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { KnowledgeTopic } from '@/types/agente'

const KNOWLEDGE_KEY = ['agente', 'knowledge'] as const
const TOPICS_KEY = ['agente', 'knowledge', 'topics'] as const

async function parseError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  return body.error ?? 'failed'
}

/**
 * Lista los temas de la KB (`GET /api/agente/knowledge/topics`). El tenant lo
 * resuelve el endpoint server-side desde el JWT. Story 6.9.
 */
export function useKnowledgeTopics() {
  const query = useQuery<KnowledgeTopic[]>({
    queryKey: TOPICS_KEY,
    queryFn: async () => {
      const res = await fetch('/api/agente/knowledge/topics')
      if (!res.ok) {
        throw new Error(`Error al obtener los temas: ${res.status}`)
      }
      const json = (await res.json()) as { topics: KnowledgeTopic[] }
      return json.topics ?? []
    },
    staleTime: 30 * 1000,
    retry: 1,
  })

  return {
    topics: query.data ?? [],
    isPending: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
  }
}

/**
 * Reindexa un tema completo (`PUT /api/agente/knowledge/topics/${source}`).
 * Al éxito invalida la KB plana y la lista de temas; toast.success. Story 6.9.
 */
export function useReindexTopic() {
  const queryClient = useQueryClient()

  const mutation = useMutation<unknown, Error, { source: string; content: string }>({
    mutationFn: async ({ source, content }) => {
      const res = await fetch(
        `/api/agente/knowledge/topics/${encodeURIComponent(source)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        },
      )
      if (!res.ok) throw new Error(await parseError(res))
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KNOWLEDGE_KEY })
      queryClient.invalidateQueries({ queryKey: TOPICS_KEY })
      toast.success('Tema reindexado')
    },
    onError: (_error, variables) => {
      toast.error('Error al reindexar el tema.', {
        action: {
          label: 'Reintentar',
          onClick: () => mutation.mutate(variables),
        },
      })
    },
  })

  return mutation
}

/**
 * Borra un tema completo (`DELETE /api/agente/knowledge/topics/${source}`).
 * Al éxito invalida la KB plana y la lista de temas; toast.success. Story 6.9.
 */
export function useDeleteTopic() {
  const queryClient = useQueryClient()

  const mutation = useMutation<unknown, Error, string>({
    mutationFn: async (source) => {
      const res = await fetch(
        `/api/agente/knowledge/topics/${encodeURIComponent(source)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) throw new Error(await parseError(res))
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KNOWLEDGE_KEY })
      queryClient.invalidateQueries({ queryKey: TOPICS_KEY })
      toast.success('Tema eliminado')
    },
    onError: (_error, variables) => {
      toast.error('Error al eliminar el tema.', {
        action: {
          label: 'Reintentar',
          onClick: () => mutation.mutate(variables),
        },
      })
    },
  })

  return mutation
}
