'use client'

import { useEffect, useState } from 'react'
import { useList } from '@refinedev/core'

// Story 16.2 — resuelve el servicio walk-in del tenant y los profesionales que
// lo atienden. Se usa en dos lugares:
//   - /recepcion (WalkInQueuePanel, Story 16.1) → monta la cola con el primer
//     profesional del servicio (defaultProfessionalId).
//   - /agenda (AgendaView, Story 16.2) → decide si el filtro de la vista Día
//     apunta al walk-in (por service_id o por professional_id) y con qué
//     profesional montar el panel.
//
// La RLS de `services` filtra por tenant (AR14) — NO agregar .eq('tenant_id').
// Por ahora hay un solo servicio walk-in por tenant: se toma el primero
// (limitación conocida, se refina si aparece más de uno).

interface WalkInServiceRow {
  service_id: string
}

interface ProfessionalOption {
  professional_id: string
  name: string
}

export interface WalkInService {
  /** service_id del servicio con allow_walk_in=true (el primero del tenant). */
  serviceId: string
  /** professional_ids de los profesionales que atienden ese servicio. */
  professionalIds: string[]
  /** Primer profesional del servicio — fallback cuando el filtro es por service_id sin professional_id. */
  defaultProfessionalId: string | null
}

export function useWalkInService(enabled = true): WalkInService | null {
  const { result } = useList<WalkInServiceRow>({
    resource: 'services',
    meta: { select: 'service_id, name' },
    filters: [
      { field: 'allow_walk_in', operator: 'eq', value: true },
      { field: 'active', operator: 'eq', value: true },
    ],
    sorters: [{ field: 'name', order: 'asc' }],
    pagination: { mode: 'off' },
    queryOptions: { enabled, staleTime: 5 * 60_000 },
  })

  const walkInServiceId = result?.data?.[0]?.service_id ?? null

  const [professionalIds, setProfessionalIds] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      // Reset dentro del IIFE (no en el cuerpo del effect) para no disparar un
      // setState síncrono — mismo criterio que NewTurnoModal/WalkInQueuePanel
      // (react-hooks/set-state-in-effect).
      setProfessionalIds([])
      if (!enabled || !walkInServiceId) return

      try {
        const res = await fetch(
          `/api/services/${encodeURIComponent(walkInServiceId)}/profesionales`,
        )
        if (!res.ok) return
        const body = (await res.json()) as { data?: ProfessionalOption[] }
        if (cancelled) return
        setProfessionalIds((body.data ?? []).map((p) => p.professional_id))
      } catch {
        // Sin profesionales resueltos no se monta la cola (silencioso, no bloquea).
      }
    })()

    return () => {
      cancelled = true
    }
  }, [enabled, walkInServiceId])

  // Sin servicio walk-in el tenant no tiene cola → nada que montar.
  if (!enabled || !walkInServiceId) return null

  return {
    serviceId: walkInServiceId,
    professionalIds,
    defaultProfessionalId: professionalIds[0] ?? null,
  }
}
