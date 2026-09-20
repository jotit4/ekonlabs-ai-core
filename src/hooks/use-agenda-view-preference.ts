'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

// Preferencia "Ver" de la agenda (`dashboard_users.preferences.agenda_view`,
// migración 075) — paso 2/3 del pedido del dueño sobre el foco de área
// (migración 062): un selector persistente, guardado POR USUARIO logueado,
// al lado de los botones de grupo de la agenda (ver AgendaFilters.tsx /
// AgendaView.tsx).
//
//   - 'foco'  = respeta el recorte por defecto de la cuenta
//               (`agenda_area_focus`, migración 062).
//   - 'todos' = sin recorte, cualquiera sea el default de la cuenta.
//
// Este hook expone SOLO la preferencia cruda del usuario (`agendaView`,
// `null` si nunca la guardó). AgendaView.tsx combina ese valor con el default
// de la cuenta (`agenda_area_focus` vía useTenantConfig) para decidir si
// recorta o no — la lógica de "qué default aplica" es de la agenda, no de
// este hook, que solo lee/guarda la fila del usuario.
export type AgendaViewPreference = 'foco' | 'todos'

interface PreferencesResponse {
  data: { agenda_view?: AgendaViewPreference }
}

const QUERY_KEY = ['me', 'preferences'] as const

export function useAgendaViewPreference(enabled: boolean = true) {
  const queryClient = useQueryClient()

  // retry: 2, mismo criterio que useTenantConfig — esta preferencia gatea
  // (junto con la config del tenant) si AgendaView pinta o no un foco
  // provisorio, así que un blip transitorio de red no debe degradar a un
  // estado de "sin preferencia" innecesariamente.
  const { data, isPending, isError, refetch } = useQuery<PreferencesResponse>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await fetch('/api/me/preferences')
      if (!res.ok) throw new Error('Error al obtener preferencias')
      return res.json() as Promise<PreferencesResponse>
    },
    staleTime: 5 * 60 * 1000,
    retry: 2,
    // Una cuenta sin `agenda_area_focus` no tiene selector ni nada que la
    // preferencia pueda cambiar: no se consulta.
    enabled,
  })

  const mutation = useMutation({
    mutationFn: async (agendaView: AgendaViewPreference) => {
      const res = await fetch('/api/me/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agenda_view: agendaView }),
      })
      if (!res.ok) throw new Error('save_failed')
      return res.json() as Promise<PreferencesResponse>
    },
    onMutate: async (agendaView: AgendaViewPreference) => {
      // Actualización optimista: el selector cambia al toque, sin esperar la
      // respuesta del PATCH — el dueño pidió "que el cambio se sienta
      // inmediato".
      await queryClient.cancelQueries({ queryKey: QUERY_KEY })
      const previous = queryClient.getQueryData<PreferencesResponse>(QUERY_KEY)
      queryClient.setQueryData<PreferencesResponse>(QUERY_KEY, { data: { agenda_view: agendaView } })
      return { previous }
    },
    onError: (_err, _agendaView, context) => {
      // Si el guardado falla, revertimos al valor anterior — nunca dejamos
      // una vista "mentirosa" (el selector marcando algo que en realidad no
      // se guardó) — y avisamos con un toast.
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEY, context.previous)
      } else {
        queryClient.removeQueries({ queryKey: QUERY_KEY })
      }
      toast.error('No se pudo guardar la preferencia. Intentá de nuevo.')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })

  return {
    // `null` = el usuario nunca guardó una preferencia (o todavía no
    // sabemos: mientras isPending es true). AgendaView decide el default de
    // la cuenta en ese caso.
    agendaView: data?.data?.agenda_view ?? null,
    isPending,
    isError,
    refetch,
    setAgendaView: mutation.mutate,
    isSaving: mutation.isPending,
  }
}
