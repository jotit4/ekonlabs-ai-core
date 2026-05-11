import type { SupabaseClient } from '@supabase/supabase-js'

export type AuditAction =
  | 'patient_accessed'
  | 'patient_data_updated'
  | 'patient_deleted'
  | 'conversation_takeover'
  | 'conversation_released'
  | 'appointment_created'
  | 'appointment_rescheduled'
  | 'config_system_prompt_updated'
  | 'user_created'
  | 'user_deactivated'
  | 'user_activated'

export type AuditEntityType = 'patient' | 'conversation' | 'appointment' | 'config' | 'user'

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
