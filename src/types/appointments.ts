export type AppointmentStatus =
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'rescheduled'
  | 'no_show'
  | 'pending'
  | 'pending_calendar'

export interface Appointment {
  appointment_id: string
  tenant_id: string
  phone_number: string
  patient_id: string | null
  service_id: string
  professional_id: string | null  // desde migration 018 — profesional nativo
  appointment_time: string // ISO 8601 timestamptz (legacy — use start_at)
  start_at: string         // ISO 8601 timestamptz (real DB column)
  end_at: string           // ISO 8601 timestamptz (real DB column)
  status: AppointmentStatus
  calendar_event_id: string | null
  created_at: string
  // Joins via Refine meta.select
  patients: { full_name: string | null } | null
  services: { name: string; professional: string | null; professional_name?: string | null; duration_minutes?: number } | null
  professionals: { name: string } | null  // join desde professional_id → professionals
}

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
  completed: 'Completado',
  rescheduled: 'Reprogramado',
  no_show: 'No-show',
  pending: 'Pendiente',
  pending_calendar: 'Pendiente (calendario)',
}

// CalendarEvent — tipo para react-big-calendar (start/end deben ser Date objects)
export interface CalendarEvent {
  id: string            // appointment_id
  title: string         // "[patient] · [service]"
  start: Date           // new Date(apt.start_at)
  end: Date             // new Date(apt.end_at)
  resource: Appointment // referencia al appointment completo
}

// Helper para convertir Appointment a CalendarEvent
export function appointmentToCalendarEvent(apt: Appointment): CalendarEvent {
  return {
    id: apt.appointment_id,
    title: `${apt.patients?.full_name ?? 'Paciente'} · ${apt.services?.name ?? ''}`,
    start: new Date(apt.start_at),
    end: new Date(apt.end_at),
    resource: apt,
  }
}
