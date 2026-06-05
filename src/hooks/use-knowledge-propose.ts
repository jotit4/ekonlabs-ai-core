'use client'

import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { KBProposalResponse } from '@/types/agente'

async function parseError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  return body.error ?? 'failed'
}

interface ProposeCorrectionVars {
  patient_question?: string
  wrong_answer?: string
  correction_note: string
  target_topic?: string
}

/**
 * Solicita una propuesta de corrección a la KB (`POST /api/agente/knowledge/propose`).
 * Es una consulta efímera (el backend no persiste) → NO invalida cache.
 * Al fallar muestra toast de error con acción "Reintentar". Story 6.9.
 */
export function useProposeCorrection() {
  const mutation = useMutation<KBProposalResponse, Error, ProposeCorrectionVars>({
    mutationFn: async (payload) => {
      const res = await fetch('/api/agente/knowledge/propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await parseError(res))
      return res.json()
    },
    onError: (_error, variables) => {
      toast.error('Error al generar la propuesta.', {
        action: {
          label: 'Reintentar',
          onClick: () => mutation.mutate(variables),
        },
      })
    },
  })

  return mutation
}
