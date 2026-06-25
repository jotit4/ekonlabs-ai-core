'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { ConversationNote } from '@/types/conversations'

function notesQueryKey(phone: string) {
  return ['conversation-notes', phone] as const
}

export function useConversationNotes(phone: string) {
  const queryClient = useQueryClient()

  // ─── Query: lista de notas ─────────────────────────────────────────────────

  const { data, isLoading, isError } = useQuery<{ notes: ConversationNote[] }>({
    queryKey: notesQueryKey(phone),
    queryFn: async () => {
      const res = await fetch(`/api/conversaciones/${encodeURIComponent(phone)}/notes`)
      if (!res.ok) throw new Error('notes_unavailable')
      return res.json() as Promise<{ notes: ConversationNote[] }>
    },
    staleTime: 30_000,
    enabled: !!phone,
    retry: 1,
  })

  // ─── Mutation: agregar nota ────────────────────────────────────────────────

  const addMutation = useMutation({
    mutationFn: async (body: string) => {
      const res = await fetch(`/api/conversaciones/${encodeURIComponent(phone)}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(json.error ?? 'add_note_failed')
      }
      return res.json() as Promise<{ note: ConversationNote }>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notesQueryKey(phone) })
    },
    onError: () => {
      toast.error('No se pudo guardar la nota. Intentá de nuevo.', {
        action: {
          label: 'Reintentar',
          onClick: () => addMutation.mutate(addMutation.variables ?? ''),
        },
      })
    },
  })

  // ─── Mutation: eliminar nota ───────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      const res = await fetch(
        `/api/conversaciones/${encodeURIComponent(phone)}/notes/${encodeURIComponent(noteId)}`,
        { method: 'DELETE' }
      )
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(json.error ?? 'delete_note_failed')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notesQueryKey(phone) })
    },
    onError: (_err, noteId) => {
      toast.error('No se pudo eliminar la nota. Intentá de nuevo.', {
        action: {
          label: 'Reintentar',
          onClick: () => deleteMutation.mutate(noteId),
        },
      })
    },
  })

  return {
    notes: data?.notes ?? [],
    isLoading,
    isError,
    addNote: addMutation.mutate,
    isAdding: addMutation.isPending,
    deleteNote: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
  }
}
