import type { AuditAction } from '@/lib/audit'

export interface AuditLogEntry {
  id: string
  user_id: string
  tenant_id: string
  action: string
  entity_type: string
  entity_id: string
  ip_address: string | null
  created_at: string
}

export interface AuditFilters {
  action?: AuditAction | null
  userId?: string | null
  dateFrom?: string | null
  dateTo?: string | null
}
