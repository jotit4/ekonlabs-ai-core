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
  /** Sesiones efectivamente REALIZADAS (turno con status 'completed'). */
  realizadas: number
  /** Turnos AGENDADOS (no cancelados): confirmed + completed + no_show + pending_calendar. */
  agendadas: number
  /** Total contratado del paquete (`total_sessions`). */
  total: number
  /** Sesiones que FALTA agendar: max(0, total − agendadas). */
  por_agendar: number
}

// Status de appointment que cuentan como "agendado" (ocupa un cupo del paquete).
// Un turno cancelado/rescheduled NO ocupa cupo → vuelve a "por agendar".
const SCHEDULED_STATUSES = new Set(['confirmed', 'completed', 'no_show', 'pending_calendar'])
// Status que cuenta como "realizado".
const DONE_STATUS = 'completed'

/**
 * Progreso HONESTO de un paquete, derivado de las SESIONES REALES (los
 * `appointments` ligados por `package_id`), NO de `total_sessions − sessions_remaining`
 * (ese campo está sobrecargado: la generación lo setea = turnos que LLEGÓ a crear,
 * lo que producía "8/10 consumidas" cuando sólo había 2 sesiones sin realizar).
 *
 * - `realizadas` = sesiones con status 'completed'.
 * - `agendadas`  = turnos NO cancelados (confirmed + completed + no_show + pending_calendar).
 * - `total`      = total_sessions contratado.
 * - `por_agendar`= max(0, total − agendadas).
 *
 * Guarda defensiva: nunca negativos aunque los datos vengan inconsistentes.
 */
export function treatmentProgress(
  treatment: Pick<Treatment, 'total_sessions'> & {
    appointments?: Pick<TreatmentSession, 'status'>[] | null
  },
): TreatmentProgress {
  const total = Math.max(0, treatment.total_sessions)
  const sessions = treatment.appointments ?? []

  let realizadas = 0
  let agendadas = 0
  for (const s of sessions) {
    if (s.status === DONE_STATUS) realizadas += 1
    if (SCHEDULED_STATUSES.has(s.status)) agendadas += 1
  }

  // Las agendadas nunca pueden superar el total contratado a efectos del contador.
  agendadas = Math.min(agendadas, total)
  realizadas = Math.min(realizadas, total)
  const por_agendar = Math.max(0, total - agendadas)

  return { realizadas, agendadas, total, por_agendar }
}
