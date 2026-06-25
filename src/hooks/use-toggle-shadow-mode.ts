'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

// La fuente de shadow_mode es ahora ['agente','shadow-mode'] (tabla `tenants`),
// desacoplada de la config del agente (`v2_clinic_configs`) desde la Story 6.6.
const SHADOW_MODE_KEY = ['agente', 'shadow-mode']

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
      await queryClient.cancelQueries({ queryKey: SHADOW_MODE_KEY })
      const previous = queryClient.getQueryData<boolean>(SHADOW_MODE_KEY)
      queryClient.setQueryData<boolean>(SHADOW_MODE_KEY, newPayload.shadow_mode_enabled)
      return { previous }
    },
    onError: (_err, newPayload, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(SHADOW_MODE_KEY, context.previous)
      }
      toast.error('Error al cambiar la confirmación de turnos.', {
        action: {
          label: 'Reintentar',
          onClick: () => mutation.mutate(newPayload),
        },
      })
    },
    onSuccess: (_, { shadow_mode_enabled }) => {
      queryClient.invalidateQueries({ queryKey: SHADOW_MODE_KEY })
      toast.success(
        shadow_mode_enabled
          ? 'Confirmación manual activada — los turnos quedan pendientes de aprobación'
          : 'Confirmación automática activada — el agente confirma los turnos al instante'
      )
    },
  })

  return {
    toggle: (enabled: boolean) => mutation.mutate({ shadow_mode_enabled: enabled }),
    isPending: mutation.isPending,
  }
}
