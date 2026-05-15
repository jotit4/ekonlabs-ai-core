// ── Story 9.4: Gestión de Horarios y Bloqueos por Profesional ─────────────────

export interface ProfessionalSchedule {
  schedule_id: string
  professional_id: string
  day_of_week: 0 | 1 | 2 | 3 | 4 | 5 | 6
  start_time: string // HH:mm:ss
  end_time: string   // HH:mm:ss
}

export interface ProfessionalScheduleListResponse {
  data: ProfessionalSchedule[]
}

export interface CreateProfessionalSchedulePayload {
  day_of_week: 0 | 1 | 2 | 3 | 4 | 5 | 6
  start_time: string // HH:mm
  end_time: string   // HH:mm
}

export interface BlockedTime {
  block_id: string
  professional_id: string
  date_from: string  // YYYY-MM-DD
  date_to: string    // YYYY-MM-DD
  reason: string | null
}

export interface BlockedTimeListResponse {
  data: BlockedTime[]
}

export interface CreateBlockedTimePayload {
  date_from: string  // YYYY-MM-DD
  date_to: string    // YYYY-MM-DD
  reason?: string
}
