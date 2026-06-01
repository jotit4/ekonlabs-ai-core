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
  // Recordatorios (Story 12.4) — los pobla el agente (12.1 / 12.3); null por defecto
  reminder_sent_at: string | null
  attendance_confirmed: boolean | null
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

// ─── Estado del recordatorio (Story 12.4) ─────────────────────────────────────
// NO confundir con `status` (completed/no_show): esto es la confirmación por WhatsApp.

export type ReminderState = 'confirmed' | 'unconfirmed' | 'none'

/**
 * Deriva el estado del recordatorio a partir de los dos campos que pobla el agente.
 * - `attendance_confirmed === true`            → 'confirmed'
 * - `reminder_sent_at != null` y NO confirmado → 'unconfirmed'
 * - resto (incluye `reminder_sent_at` null)    → 'none' (sin badge)
 */
export function reminderState(
  apt: Pick<Appointment, 'reminder_sent_at' | 'attendance_confirmed'>,
): ReminderState {
  if (apt.attendance_confirmed === true) return 'confirmed'
  if (apt.reminder_sent_at != null) return 'unconfirmed'
  return 'none'
}

export const REMINDER_STATE_LABELS: Record<Exclude<ReminderState, 'none'>, string> = {
  confirmed: 'Confirmado por el paciente',
  unconfirmed: 'Sin confirmar',
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
