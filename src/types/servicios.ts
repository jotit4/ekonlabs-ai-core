// ── Story 6.4: Horarios y Excepciones ─────────────────────────────────────────

export interface ServiceHour {
  hour_id: string
  service_id: string
  tenant_id: string
  day_of_week: 0 | 1 | 2 | 3 | 4 | 5 | 6
  start_time: string   // "HH:mm:ss" — TIME de Postgres
  end_time: string     // "HH:mm:ss"
  slot_duration_minutes: number
  active: boolean
  created_at: string
}

export interface CreateServiceHourPayload {
  day_of_week: 0 | 1 | 2 | 3 | 4 | 5 | 6
  start_time: string   // "HH:mm" — el API Route agrega ":00"
  end_time: string     // "HH:mm"
  slot_duration_minutes?: number
}

export interface ServiceHoursListResponse {
  data: ServiceHour[]
}

export interface ServiceException {
  exception_id: string
  service_id: string
  tenant_id: string
  exception_date: string   // "YYYY-MM-DD"
  reason: string | null
  created_at: string
}

export interface CreateServiceExceptionPayload {
  exception_date: string   // "YYYY-MM-DD"
  reason?: string
}

export interface ServiceExceptionsListResponse {
  data: ServiceException[]
}

// ── Story 6.3: Servicios ──────────────────────────────────────────────────────

export interface Service {
  service_id: string
  tenant_id: string
  name: string
  calendar_id: string
  professional_name: string | null
  duration_minutes: number
  active: boolean
  booking_mode: 'appointment' | 'walk_in' | 'gated' | 'cycle'
  capacity_per_slot: number | null
  requires_prescription: boolean
  is_referral_only: boolean
  reminder_hours_before: number | null
  reminder_instructions: string | null
  prerequisite_note: string | null
  // Agrupador para la vista de recepción (migración 053, pedido ISADI
  // 2026-07-16): 'fisioterapia' | 'pileta' | 'pilates' | null. NULL = el
  // servicio no aparece agrupado en la agenda de recepción (ej. Odontología).
  // Los roles admin/doctor siguen viendo el servicio real, nunca el grupo.
  reception_group?: string | null
  created_at: string
}

export interface ServicesListResponse {
  data: Service[]
}

export interface CreateServicePayload {
  name: string
  calendar_id: string
  professional_name?: string
  duration_minutes?: number
  booking_mode?: 'appointment' | 'walk_in' | 'gated' | 'cycle'
  reminder_hours_before?: number | null
  reminder_instructions?: string | null
}

export interface UpdateServicePayload {
  name?: string
  calendar_id?: string
  professional_name?: string
  duration_minutes?: number
  active?: boolean
  booking_mode?: 'appointment' | 'walk_in' | 'gated' | 'cycle'
  reminder_hours_before?: number | null
  reminder_instructions?: string | null
}
