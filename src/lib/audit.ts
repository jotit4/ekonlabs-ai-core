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
  // Story 13.6 — decisión manual de la recepcionista al ausentarse una sesión de serie.
  | 'treatment_session_consumed'
  | 'treatment_session_recoverable'
  | 'treatment_session_justified'
  // Story 14.2 — upsert del plan de tratamiento (HCE) ligado al paquete.
  | 'treatment_plan_updated'
  // Story 14.3 — upsert de la evolución por sesión (HCE) ligada al turno.
  | 'session_note_updated'

export type AuditEntityType =
  | 'patient'
  | 'conversation'
  | 'appointment'
  | 'config'
  | 'user'
  | 'knowledge'
  | 'treatment'

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
