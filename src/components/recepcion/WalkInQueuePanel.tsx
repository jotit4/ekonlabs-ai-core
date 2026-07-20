'use client'

import { ColaOrdenLlegada } from '@/components/recepcion/ColaOrdenLlegada'
import { useWalkInService } from '@/hooks/use-walk-in-service'

// Story 16.1 (AC4) — resuelve el servicio walk-in del tenant y su profesional, y
// monta <ColaOrdenLlegada/> SOLO si existe al menos un servicio con
// allow_walk_in=true. Si ninguno, no renderiza nada (la home queda intacta).
//
// Story 16.2 — la resolución del servicio+profesional se movió al hook
// compartido `useWalkInService` (DRY: la agenda del Dr/admin lo reusa). Este
// panel se queda solo con el montaje de la cola en la home de recepción, con el
// PRIMER profesional del servicio (defaultProfessionalId).

interface WalkInQueuePanelProps {
  /** Fecha de hoy en YYYY-MM-DD. */
  hoyISO: string
}

export function WalkInQueuePanel({ hoyISO }: WalkInQueuePanelProps) {
  const walkIn = useWalkInService()

  // Home intacta si no hay servicio walk-in o no se resolvió su profesional.
  if (!walkIn || !walkIn.defaultProfessionalId) return null

  return (
    <ColaOrdenLlegada
      serviceId={walkIn.serviceId}
      professionalId={walkIn.defaultProfessionalId}
      hoyISO={hoyISO}
    />
  )
}
