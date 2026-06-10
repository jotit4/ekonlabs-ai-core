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

// Contrato de la fila `treatment_plans` (Story 14.2 — Epic 14 HCE).
// Columnas EXACTAS de la migración 040 (supabase/migrations/...040_treatment_plans_table.sql).
// 1:1 lógico con `treatments` (UNIQUE treatment_id). discharge_* son scope de 14.6
// (existen en la tabla, viajan como null — esta story NO los escribe).
export interface TreatmentPlan {
  plan_id: string
  tenant_id: string
  treatment_id: string
  patient_id: string
  motivo_consulta: string | null
  objetivo: string | null
  cie10_code: string | null
  indicated_sessions: number | null
  discharge_at: string | null
  discharge_report: string | null
  author_id: string | null
  created_at: string
  updated_at: string
}

// Contrato de la fila `session_notes` (Story 14.3 — Epic 14 HCE).
// Columnas EXACTAS de la migración 041 (supabase/migrations/...041_session_notes_table.sql).
// 1 evolución por turno (UNIQUE appointment_id). `treatment_id` NULLABLE:
// un turno suelto sin paquete TAMBIÉN evoluciona (AC del epic).
export interface SessionNote {
  session_note_id: string
  tenant_id: string
  appointment_id: string
  treatment_id: string | null
  patient_id: string
  worked_on: string | null
  progress: string | null
  author_id: string | null
  created_at: string
  updated_at: string
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
