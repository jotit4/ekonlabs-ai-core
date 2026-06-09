// Tipos del Tratamiento clínico / Paquete de sesiones (Epic 13)
// FUENTE DE VERDAD: _bmad-output/planning-artifacts/domain-tratamiento-clinico.md §3.1
// + migración 036 (supabase/migrations/...036_treatments_table.sql).
// NO redefinir campos fuera de ese contrato.

export type TreatmentStatus = 'active' | 'completed' | 'cancelled' | 'expired'

export const TREATMENT_STATUS_LABELS: Record<TreatmentStatus, string> = {
  active: 'Activo',
  completed: 'Completado',
  cancelled: 'Cancelado',
  expired: 'Vencido',
}

// Contrato de la fila `treatments` (lectura). Columnas = domain §3.1 / migración 036.
export interface Treatment {
  treatment_id: string
  tenant_id: string
  patient_id: string
  service_id: string
  professional_id: string | null
  total_sessions: number
  sessions_remaining: number
  start_date: string
  pattern: unknown
  status: TreatmentStatus
  expires_at: string | null
  created_at: string
}

// Sesión ligada a un paquete (reverse-join treatments → appointments(package_id)).
export interface TreatmentSession {
  appointment_id: string
  session_index: number | null
  start_at: string
  end_at: string
  status: string
}

// Paquete con sus joins para la ficha del paciente (read path opción A).
export interface TreatmentWithSessions extends Treatment {
  services: { name: string } | null
  professionals: { name: string } | null
  appointments: TreatmentSession[] | null
}

export interface TreatmentProgress {
  consumidas: number
  restantes: number
  total: number
}

/**
 * Progreso de tracking de un paquete (solo lectura).
 * `consumidas = total_sessions − sessions_remaining` (NO al revés).
 * Caso del AC: total=10, sessions_remaining=7 → consumidas=3, restantes=7.
 * La lógica de decremento la implementa 13.6; acá sólo se LEE el contador vivo.
 */
export function treatmentProgress(
  treatment: Pick<Treatment, 'total_sessions' | 'sessions_remaining'>,
): TreatmentProgress {
  const total = treatment.total_sessions
  const restantes = treatment.sessions_remaining
  // Guarda defensiva: nunca consumidas negativas si los datos vienen inconsistentes.
  const consumidas = Math.max(0, total - restantes)
  return { consumidas, restantes, total }
}
