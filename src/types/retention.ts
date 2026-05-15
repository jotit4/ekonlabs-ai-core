// Retention policy definition (static, defined in the dashboard)
export interface RetentionPolicy {
  name: string
  label: string
  retentionDays: number
  description: string
}

// Response from FastAPI GET /api/v1/retention/status
export interface RetentionStatusResponse {
  last_run_at: string | null
  next_run_at: string | null
  status: 'ok' | 'running' | 'failed' | 'overdue'
  records_purged_last_run: number | null
  error_message: string | null
}

// Result from our /api/retention-status API Route
export interface RetentionStatusResult {
  status: 'ok' | 'degraded' | 'not_implemented'
  data: RetentionStatusResponse | null
  message?: string
}

// Static retention policies — do NOT modify without a PRD change
export const RETENTION_POLICIES: RetentionPolicy[] = [
  {
    name: 'audit_logs',
    label: 'Registros de auditoría',
    retentionDays: 90,
    description: 'Los registros de auditoría se purgan automáticamente a los 90 días.',
  },
  {
    name: 'conversations',
    label: 'Conversaciones',
    retentionDays: 730, // 2 años = 365 * 2
    description: 'Las conversaciones se archivan o anonimizan a los 2 años (730 días).',
  },
]
