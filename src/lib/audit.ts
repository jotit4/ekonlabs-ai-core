import type { SupabaseClient } from '@supabase/supabase-js'

export type AuditAction =
  | 'patient_accessed'
  | 'patient_data_updated'
  | 'patient_deleted'
  | 'conversation_takeover'
  | 'conversation_released'
  | 'appointment_created'
  | 'appointment_rescheduled'
  | 'appointment_cancelled'
  | 'appointment_completed'
  | 'appointment_no_show'
  // Color manual del turno (migración 051 — paleta muda del turnero, pedido ISADI).
  | 'appointment_color_changed'
  | 'config_system_prompt_updated'
  | 'config_shadow_mode_updated'
  | 'config_service_updated'
  | 'config_agent_updated'
  | 'user_created'
  | 'user_deactivated'
  | 'user_activated'
  | 'patient_document_uploaded'
  | 'patient_document_accessed'
  | 'kb_topic_reindexed'
  | 'kb_topic_deleted'
  | 'treatment_created'
  | 'treatment_generated'
  // Reclamo ISADI — agendar sesiones del bono MANUAL Y FLEXIBLE (1 o varias).
  | 'treatment_sessions_scheduled'
  // Story 13.6 — decisión manual de la recepcionista al ausentarse una sesión de serie.
  | 'treatment_session_consumed'
  | 'treatment_session_recoverable'
  | 'treatment_session_justified'
  // Story 14.2 — upsert del plan de tratamiento (HCE) ligado al paquete.
  | 'treatment_plan_updated'
  // Story 14.3 — upsert de la evolución por sesión (HCE) ligada al turno.
  | 'session_note_updated'
  // Story 14.4 — update de antecedentes/alergias/medicación del paciente (HCE).
  | 'patient_clinical_data_updated'
  // Story 14.6 — alta / informe final del tratamiento (HCE).
  | 'treatment_discharged'
  // Feriados + estado del día (migración 052 — pedido ISADI 2026-07-14): la
  // clínica decide "abre"/"no abre" para una fecha (feriado nacional u otra).
  | 'clinic_day_status_updated'

export type AuditEntityType =
  | 'patient'
  | 'conversation'
  | 'appointment'
  | 'config'
  | 'user'
  | 'knowledge'
  | 'treatment'
  | 'clinic_day_status'

interface LogAuditParams {
  action: AuditAction
  entity_type: AuditEntityType
  entity_id: string
  supabase: SupabaseClient
  ip_address?: string
}

export async function logAudit({
  action,
  entity_type,
  entity_id,
  supabase,
  ip_address,
}: LogAuditParams): Promise<void> {
  try {
    const { error } = await supabase.from('audit_logs').insert({
      action,
      entity_type,
      entity_id,
      ip_address: ip_address ?? null,
    })

    if (error) {
      console.error('[audit] logAudit error:', error)
    }
  } catch (err) {
    console.error('[audit] logAudit exception:', err)
  }
}
