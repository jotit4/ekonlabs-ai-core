'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { UpdateClinicConfigPayload } from '@/types/agente'

/**
 * Mutación para `PATCH /api/agente/config` (tabla canónica `v2_clinic_configs`).
 * El payload es parcial: sólo los campos editados. Invalida `['agente','config']`
 * al éxito y ofrece toast de error con acción "Reintentar" (Story 6.6).
 */
export function useUpdateAgentConfig() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (data: UpdateClinicConfigPayload) => {
      const res = await fetch('/api/agente/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'update_failed')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agente', 'config'] })
      toast.success('Configuración del agente guardada correctamente')
    },
    onError: (_error, variables) => {
      toast.error('Error al guardar.', {
        action: {
          label: 'Reintentar',
          onClick: () => mutation.mutate(variables),
        },
      })
    },
  })

  return mutation
}
