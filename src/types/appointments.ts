export type AppointmentStatus =
  | 'confirmed'
  | 'cancelled'
  | 'rescheduled'
  | 'no_show'
  | 'pending'

export interface Appointment {
  appointment_id: string
  tenant_id: string
  phone_number: string
  patient_id: string | null
  service_id: string
  appointment_time: string // ISO 8601 timestamptz
  status: AppointmentStatus
  calendar_event_id: string | null
  created_at: string
  // Joins via Refine meta.select
  patients: { full_name: string | null } | null
  services: { name: string; professional: string | null } | null
}

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
  rescheduled: 'Reprogramado',
  no_show: 'No-show',
  pending: 'Pendiente',
}
