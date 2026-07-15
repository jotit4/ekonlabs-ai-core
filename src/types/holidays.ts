// Tipos de feriados nacionales + decisión de la clínica por día (pedido ISADI
// 2026-07-14, reunión de cliente).
//
// Modelo: dos fuentes que se combinan en un único "estado del día":
// 1. `holidays` — catálogo GLOBAL (no por tenant) de feriados nacionales de
//    Argentina, cargado por seed (migración 052). Es de solo lectura para los
//    tenants.
// 2. `clinic_day_status` — decisión de la clínica (por tenant) para una fecha
//    puntual: "abre" o "no abre". Sirve TANTO para decidir un feriado como
//    para cerrar a mano un día que NO es feriado (ej. corte de agua).
//
// Regla de negocio (decisión de producto YA TOMADA, no cambiar sin acuerdo):
// un feriado nacional se considera CERRADO por defecto hasta que la clínica
// decida explícitamente "sí, abrimos". Un día normal sigue abierto por
// defecto salvo que la clínica lo cierre a mano. Ver `computeEffectiveOpen`
// en `@/lib/agenda/day-status.ts` — es el espejo en JS de la misma regla que
// aplica la RPC `check_clinic_availability` en SQL.

/** Fila del catálogo global de feriados nacionales (`holidays`). */
export interface NationalHoliday {
  holiday_id: string
  country: string // 'AR'
  holiday_date: string // 'YYYY-MM-DD'
  name: string
}

/** Fila de la decisión de la clínica para un día (`clinic_day_status`). */
export interface ClinicDayStatusRow {
  day_status_id: string
  tenant_id: string
  status_date: string // 'YYYY-MM-DD'
  is_open: boolean
  reason: string | null
  decided_by: string | null
  decided_by_name: string | null
  decided_at: string | null // ISO timestamp
}

/**
 * Estado combinado de un día, tal como lo devuelve `GET /api/agenda/day-status`
 * y consume la UI (Semana/Mes). Solo se listan los días "especiales" (feriado
 * y/o con decisión de la clínica) — un día ausente del mapa es un día normal
 * abierto, sin badge.
 */
export interface DayStatusEntry {
  date: string // 'YYYY-MM-DD'
  isHoliday: boolean
  holidayName: string | null
  /** `null` = la clínica no decidió nada para esta fecha. */
  decisionIsOpen: boolean | null
  decidedByName: string | null
  decidedAt: string | null
  reason: string | null
  /** Resultado final tras aplicar la regla de negocio (ver day-status.ts). */
  effectiveOpen: boolean
}

/** Respuesta de `GET /api/agenda/day-status?date_from=...&date_to=...`. */
export interface DayStatusRangeResponse {
  days: Record<string, DayStatusEntry>
}
