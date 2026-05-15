'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { CreateProfessionalSchedulePayload } from '@/types/profesionales-horarios'

export function useCreateProfessionalSchedule(professionalId: string) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (data: CreateProfessionalSchedulePayload) => {
      const res = await fetch(`/api/profesionales/${professionalId}/horarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'create_failed')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profesionales', professionalId, 'horarios'] })
      toast.success('Horario agregado correctamente')
    },
    onError: (error, variables) => {
      const message = error instanceof Error ? error.message : ''
      if (message.includes('solapa')) {
        toast.error('Este horario se solapa con uno existente')
      } else {
        toast.error('Error al agregar el horario. Intentá de nuevo.', {
          action: {
            label: 'Reintentar',
            onClick: () => mutation.mutate(variables),
          },
        })
      }
    },
  })

  return mutation
}
