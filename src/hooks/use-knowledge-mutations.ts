'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type {
  CreateKnowledgePayload,
  KnowledgeEntry,
  UpdateKnowledgePayload,
} from '@/types/agente'

const KNOWLEDGE_KEY = ['agente', 'knowledge'] as const

async function parseError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  return body.error ?? 'failed'
}

/**
 * Crea una entrada de la base de conocimiento (`POST /api/agente/knowledge`).
 * Al éxito invalida `['agente','knowledge']` y muestra toast; al fallar, toast
 * de error con acción "Reintentar" (patrón de `useUpdateAgentConfig`). Story 6.7.
 */
export function useCreateKnowledge() {
  const queryClient = useQueryClient()

  const mutation = useMutation<KnowledgeEntry, Error, CreateKnowledgePayload>({
    mutationFn: async (payload) => {
      const res = await fetch('/api/agente/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await parseError(res))
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KNOWLEDGE_KEY })
      toast.success('Entrada agregada a la base de conocimiento')
    },
    onError: (_error, variables) => {
      toast.error('Error al agregar la entrada.', {
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
 * Edita una entrada (`PATCH /api/agente/knowledge/${id}`). Story 6.7.
 */
export function useUpdateKnowledge() {
  const queryClient = useQueryClient()

  const mutation = useMutation<
    KnowledgeEntry,
    Error,
    { id: string } & UpdateKnowledgePayload
  >({
    mutationFn: async ({ id, ...payload }) => {
      const res = await fetch(`/api/agente/knowledge/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await parseError(res))
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KNOWLEDGE_KEY })
      toast.success('Entrada actualizada')
    },
    onError: (_error, variables) => {
      toast.error('Error al actualizar la entrada.', {
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
 * Borra una entrada (`DELETE /api/agente/knowledge/${id}`). Story 6.7.
 */
export function useDeleteKnowledge() {
  const queryClient = useQueryClient()

  const mutation = useMutation<{ ok: boolean }, Error, string>({
    mutationFn: async (id) => {
      const res = await fetch(`/api/agente/knowledge/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(await parseError(res))
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KNOWLEDGE_KEY })
      toast.success('Entrada eliminada')
    },
    onError: (_error, variables) => {
      toast.error('Error al eliminar la entrada.', {
        action: {
          label: 'Reintentar',
          onClick: () => mutation.mutate(variables),
        },
      })
    },
  })

  return mutation
}
