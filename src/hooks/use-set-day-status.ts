'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

export interface SetDayStatusPayload {
  date: string // 'YYYY-MM-DD'
  is_open: boolean
  reason?: string
}

// POST /api/agenda/day-status — decide "abre"/"no abre" para una fecha. Un
// solo mutation hook sirve para decidir un feriado o cerrar/reabrir un día
// normal a mano (el payload es idéntico en ambos casos).
export function useSetDayStatus() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (payload: SetDayStatusPayload) => {
      const res = await fetch('/api/agenda/day-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'save_failed')
      }
      return res.json()
    },
    onSuccess: (_data, variables) => {
      // Invalida TODAS las queries de day-status (distintos rangos Semana/Mes
      // pueden estar en caché) — el filtro por prefix cubre cualquier rango.
      queryClient.invalidateQueries({ queryKey: ['agenda', 'day-status'] })
      toast.success(variables.is_open ? 'Día marcado como abierto' : 'Día marcado como cerrado')
    },
    onError: (_error, variables) => {
      toast.error('Error al guardar la decisión. Intentá de nuevo.', {
        action: {
          label: 'Reintentar',
          onClick: () => mutation.mutate(variables),
        },
      })
    },
  })

  return mutation
}
