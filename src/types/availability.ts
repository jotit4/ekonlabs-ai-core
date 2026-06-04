// Tipos de disponibilidad (Story 10.7).
// Un "shift" libre es un hueco disponible calculado por la RPC
// `check_clinic_availability` (migración 029). NO confundir con `Appointment`:
// un hueco libre ≠ un turno ocupado, son entidades distintas.

/**
 * Un hueco libre devuelto por la RPC `check_clinic_availability`.
 * Las 9 claves del contrato están siempre presentes.
 * - `open`/`close`: hora local de Buenos Aires ya formateada (HH:MM) — para mostrar.
 * - `slot_start_iso`/`slot_end_iso`: ISO UTC con sufijo `Z` — para ordenar/comparar.
 */
export interface AvailabilityShift {
  open: string // 'HH:MM' hora local (display)
  close: string // 'HH:MM' hora local (display)
  slot_start_iso: string // ISO UTC con sufijo Z
  slot_end_iso: string // ISO UTC con sufijo Z
  service_id: string
  service_name: string
  require_referral: boolean
  professional_id: string
  professional_name: string
}

/** Forma completa de un día (modo shifts). */
export interface DayShifts {
  available: boolean
  shifts: AvailabilityShift[]
}

/** Forma liviana de un día (modo summary) — solo el conteo de huecos. */
export interface DaySummary {
  free_count: number
}

/** Respuesta del endpoint en modo shifts (default). */
export interface AvailabilityShiftsResponse {
  days: Record<string, DayShifts>
}

/** Respuesta del endpoint en modo summary (`?summary=true`). */
export interface AvailabilitySummaryResponse {
  days: Record<string, DaySummary>
}
