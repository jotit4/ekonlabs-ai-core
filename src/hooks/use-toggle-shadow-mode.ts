'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { TenantAgentConfig } from '@/types/agente'

export function useToggleShadowMode() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (payload: { shadow_mode_enabled: boolean }) => {
      const res = await fetch('/api/agente/shadow-mode', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'update_failed')
      }
      return res.json()
    },
    onMutate: async (newPayload) => {
      await queryClient.cancelQueries({ queryKey: ['agente', 'config'] })
      const previous = queryClient.getQueryData<TenantAgentConfig>(['agente', 'config'])
      if (previous) {
        queryClient.setQueryData<TenantAgentConfig>(['agente', 'config'], {
          ...previous,
          shadow_mode_enabled: newPayload.shadow_mode_enabled,
        })
      }
      return { previous }
    },
    onError: (_err, newPayload, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['agente', 'config'], context.previous)
      }
      toast.error('Error al cambiar el modo shadow.', {
        action: {
          label: 'Reintentar',
          onClick: () => mutation.mutate(newPayload),
        },
      })
    },
    onSuccess: (_, { shadow_mode_enabled }) => {
      queryClient.invalidateQueries({ queryKey: ['agente', 'config'] })
      toast.success(
        shadow_mode_enabled
          ? 'Shadow mode activado — agendamiento automático bloqueado'
          : 'Shadow mode desactivado — agendamiento automático habilitado'
      )
    },
  })

  return {
    toggle: (enabled: boolean) => mutation.mutate({ shadow_mode_enabled: enabled }),
    isPending: mutation.isPending,
  }
}
