import { addDays, addWeeks, format, parseISO } from 'date-fns'
import type { WeeklySlot } from '@/lib/schemas/treatment.schema'

// Generación pura de la serie de turnos de un paquete (Story 13.3).
//
// Este módulo NO conoce Supabase: recibe una función inyectable
// `isSlotAvailable(date, slot)` que decide si una ocurrencia (fecha + slot del
// patrón) tiene un hueco real, devolviendo el { start_at, end_at } UTC o null si
// hay conflicto (feriado / service_exceptions / blocked_times / slot ocupado).
// Así el corazón del algoritmo (skip de conflictos, corte por N / expires_at /
// MAX_WEEKS, orden cronológico del session_index) es testeable de forma
// determinista. La API Route es la que cablea la RPC `check_clinic_availability`.

/** Límite duro de semanas iteradas — evita bucle infinito si el patrón es
 *  imposible (todas las ocurrencias en conflicto) y no hay `expires_at`. */
export const MAX_WEEKS = 104 // ~2 años

/** Resultado de la consulta de disponibilidad para una ocurrencia concreta. */
export interface SlotAvailability {
  start_at: string // ISO UTC (slot_start_iso del shift 029)
  end_at: string // ISO UTC (slot_end_iso del shift 029)
}

/** Una sesión efectivamente colocada en el plan. */
export interface Placement {
  session_index: number // 1..creados, cronológico
  date: string // YYYY-MM-DD (fecha local de la ocurrencia)
  slot: WeeklySlot
  start_at: string // ISO UTC
  end_at: string // ISO UTC
}

export interface GenerateSeriesInput {
  slots: WeeklySlot[]
  start_date: string // YYYY-MM-DD
  total_sessions: number
  expires_at?: string | null // YYYY-MM-DD nullable
  maxWeeks?: number
  /** null = conflicto (saltear); { start_at, end_at } = hueco disponible. */
  isSlotAvailable: (date: string, slot: WeeklySlot) => SlotAvailability | null
}

export interface GenerateSeriesResult {
  placements: Placement[]
  salteados: number
  no_colocados: number
}

// day_of_week del patrón: 0=lunes … 6=domingo (ISODOW-1, misma convención que
// 029/professional_schedules). JS Date.getDay() es 0=domingo … 6=sábado.
// Conversión: patternDow = (getDay() + 6) % 7  → lunes(getDay=1)→0, domingo(getDay=0)→6.
function jsDayToPatternDow(jsDay: number): number {
  return (jsDay + 6) % 7
}

/** Orden cronológico estable de los slots dentro de una semana: por
 *  day_of_week, luego time. Reexportado para que la API Route recorra las
 *  ocurrencias en el MISMO orden que el helper (sin duplicar lógica). */
export function orderSlots(slots: WeeklySlot[]): WeeklySlot[] {
  return [...slots].sort((a, b) => {
    if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week
    return a.time.localeCompare(b.time)
  })
}

/**
 * Fecha (YYYY-MM-DD) de la ocurrencia de un `day_of_week` del patrón en una
 * semana dada, contando semanas desde `start_date`.
 *
 * Semana 0 = la primera ocurrencia de ese `day_of_week` en o después de
 * `start_date`. Semana k = esa fecha + 7*k días.
 *
 * Exportada para que la API Route resuelva la disponibilidad (async) sobre las
 * mismas fechas que el helper calculará (fuente de verdad única de la conversión
 * de calendario 0=lunes..6=domingo).
 */
export function occurrenceDate(startDate: string, dayOfWeek: number, week: number): string {
  const start = parseISO(startDate) // local midnight — operaciones de calendario, sin drift TZ
  const startPatternDow = jsDayToPatternDow(start.getDay())
  // días a sumar para llegar al primer `dayOfWeek` en o después de start
  const offset = (dayOfWeek - startPatternDow + 7) % 7
  const firstOccurrence = addDays(start, offset)
  const occurrence = addWeeks(firstOccurrence, week)
  return format(occurrence, 'yyyy-MM-dd')
}

/**
 * Genera el plan de colocación de la serie repitiendo el patrón semana a semana.
 *
 * - Recorre semanas 0, 1, 2, … desde `start_date`.
 * - Dentro de cada semana recorre los slots ORDENADOS por (day_of_week, time),
 *   de modo que el `session_index` queda cronológico (1..creados).
 * - Una ocurrencia en conflicto (`isSlotAvailable` → null) NO consume una
 *   sesión: incrementa `salteados` y se sigue intentando en la próxima
 *   ocurrencia (mismo slot la semana siguiente, u otro slot de la semana).
 * - Corta al colocar `total_sessions` (corte por N), o cuando TODAS las
 *   ocurrencias de la semana superan `expires_at`, o al alcanzar `maxWeeks`.
 * - `no_colocados = total_sessions − creados` al terminar.
 */
export function generateSeries(input: GenerateSeriesInput): GenerateSeriesResult {
  const {
    slots,
    start_date,
    total_sessions,
    expires_at = null,
    maxWeeks = MAX_WEEKS,
    isSlotAvailable,
  } = input

  // Orden cronológico estable dentro de la semana: por day_of_week, luego time.
  const orderedSlots = orderSlots(slots)

  const placements: Placement[] = []
  let salteados = 0

  for (let week = 0; week < maxWeeks; week++) {
    if (placements.length >= total_sessions) break

    let allSlotsExpired = expires_at != null // se vuelve false si algún slot de la semana aún no venció

    for (const slot of orderedSlots) {
      if (placements.length >= total_sessions) break

      const date = occurrenceDate(start_date, slot.day_of_week, week)

      // Corte por expires_at: comparación lexicográfica de YYYY-MM-DD (válida para fechas ISO).
      if (expires_at != null && date > expires_at) {
        // esta ocurrencia ya venció; no la intentamos, pero seguimos con otros slots
        continue
      }
      allSlotsExpired = false

      const avail = isSlotAvailable(date, slot)
      if (avail == null) {
        salteados += 1
        continue
      }

      placements.push({
        session_index: placements.length + 1,
        date,
        slot,
        start_at: avail.start_at,
        end_at: avail.end_at,
      })
    }

    // Si TODAS las ocurrencias de esta semana ya superaron expires_at, las
    // semanas siguientes también lo harán → cortar el bucle externo.
    if (allSlotsExpired) break
  }

  const creados = placements.length
  const no_colocados = Math.max(0, total_sessions - creados)

  return { placements, salteados, no_colocados }
}
