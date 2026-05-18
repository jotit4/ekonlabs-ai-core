'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'

interface CreateProfessionalUserPayload {
  professionalId: string
  email: string
}

interface CreateProfessionalUserResponse {
  data: {
    user_id: string
    email: string
    full_name: string
  }
}

export function useCreateProfessionalUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ professionalId, email }: CreateProfessionalUserPayload) => {
      const res = await fetch(`/api/profesionales/${professionalId}/usuario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Error al crear cuenta de usuario')
      }

      return res.json() as Promise<CreateProfessionalUserResponse>
    },
    onSuccess: () => {
      // Invalidar la lista de profesionales para que se actualice linked_user_email
      queryClient.invalidateQueries({ queryKey: ['profesionales', 'list'] })
    },
  })
}
