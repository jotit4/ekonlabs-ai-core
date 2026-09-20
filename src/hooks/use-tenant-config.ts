'use client'

import { useQuery } from '@tanstack/react-query'
import type { ReceptionGroupsConfig } from '@/lib/agenda/reception-groups'

interface TenantConfigResponse {
  uses_native_calendar: boolean
  agenda_area_focus: 'rehab' | null
  // reception_groups / reception_default_group (tenants.rules, migración 069)
  // — ver /api/tenant/config y src/lib/agenda/reception-groups.ts.
  reception_groups: ReceptionGroupsConfig
  reception_default_group: string | null
}

export function useTenantConfig() {
  // retry: 2 (antes 1) — desde que AgendaView deja de degradar en silencio a
  // "sin recorte" ante un error de config y en cambio muestra el estado de
  // error + reintento (corrección de code review), un blip transitorio de red
  // ya alcanza para mostrarle ESE estado a una recepcionista de ISADI, que
  // además es sensible a cambios visuales. Un reintento extra reduce falsos
  // positivos de "error" por fallos que se resuelven solos, sin costo real
  // (esta query es liviana y no está en una ruta de escritura).
  const { data, isPending, isError, refetch } = useQuery<TenantConfigResponse>({
    queryKey: ['tenant', 'config'],
    queryFn: async () => {
      const res = await fetch('/api/tenant/config')
      if (!res.ok) throw new Error('Error al obtener config del tenant')
      return res.json() as Promise<TenantConfigResponse>
    },
    staleTime: 5 * 60 * 1000,
    retry: 2,
  })

  return {
    usesNativeCalendar: data?.uses_native_calendar ?? false,
    // agenda_area_focus (tenants.rules, migr 062) — null mientras carga, si el
    // tenant no tiene el ajuste, o si la query falló. AgendaView ya NO usa
    // este valor "de más" como sustituto de un recorte no resuelto: mientras
    // `isPending`/`isError` sea true, no pinta turnos (skeleton o estado de
    // error) en vez de decidir un `areaFocus` provisorio — ver AgendaView.
    agendaAreaFocus: data?.agenda_area_focus ?? null,
    // reception_groups / reception_default_group — mismo criterio que
    // agendaAreaFocus arriba: mientras carga, falló, o el tenant no tiene el
    // ajuste, se exponen sus defaults seguros ({} / null). NewTurnoModal los
    // usa para decidir si recepción tiene flujo simplificado (ver
    // receptionHasSimplifiedFlow) — con estos defaults, cualquier cuenta sin
    // el ajuste cae al formulario completo (igual que administración), nunca
    // a un grupo inexistente.
    receptionGroups: data?.reception_groups ?? {},
    receptionDefaultGroup: data?.reception_default_group ?? null,
    isPending,
    isError,
    refetch,
  }
}
