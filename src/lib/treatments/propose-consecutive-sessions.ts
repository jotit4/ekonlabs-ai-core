import { advanceDate } from '@/lib/agenda/advance-date'
import type { AvailabilityShift } from '@/types/availability'

// Propuesta AUTOMÁTICA de fechas consecutivas para un bono x5/x10 (Pedido B —
// ISADI 2026-07-14: "agregar 5 y 10 sesiones... que se agende automático, un
// día atrás del otro"). DECISIÓN DEL CLIENTE: auto-propone, la secretaria
// ajusta — este módulo SOLO calcula una propuesta editable; no reserva nada.
//
// Deliberadamente NO reusa `generateSeries` (src/lib/treatments/generate-series.ts):
// ese motor repite un PATRÓN SEMANAL (día_de_la_semana + hora, fijo) semana a
// semana, pensado para tratamientos con cadencia fija (ej. "todos los martes a
// las 10"). Acá el pedido es distinto: UN horario ancla (elegido a mano) que se
// repite cada N días consecutivos (o cada 2/3 días según la cadencia elegida),
// sin atarse a un día de la semana fijo. Forzar ese caso al modelo de
// generateSeries hubiera exigido inventar un "patrón" artificial y duplicar la
// resolución de disponibilidad (ese motor está further cableado a la ejecución
// server-side de /api/treatments/[id]/generate, que RESERVA de una — no sirve
// para una vista previa editable). En cambio, este módulo reutiliza:
// - `advanceDate` (mismo helper que la cadencia MANUAL de MultiSessionScheduler)
//   para el avance de fechas (saltea fin de semana).
// - la disponibilidad YA CARGADA (una sola consulta de rango a /api/availability,
//   ver `fetchAvailabilityDays` en use-availability.ts) — sin nuevas RPCs.

export interface ProposedSessionSlot {
  start_at: string
  end_at: string
  date: string
  label: string
  professional_id: string
  professional_name: string
}

export interface ProposedSession {
  /** 1-based; 1 = la sesión ancla (ya elegida a mano). */
  index: number
  date: string // YYYY-MM-DD
  /** null = ese día no tiene un hueco libre a la hora del ancla — queda PENDIENTE de elegir a mano. */
  slot: ProposedSessionSlot | null
}

export interface ProposeConsecutiveSessionsInput {
  /** Fecha (YYYY-MM-DD) de la sesión ancla ya elegida. */
  anchorDate: string
  /** Hora (HH:MM) de la sesión ancla — se busca la MISMA hora en los días propuestos. */
  anchorLabel: string
  /** Profesional del ancla (si se conoce) — se prioriza por continuidad en modo "cualquiera". */
  anchorProfessionalId?: string
  /** Profesional CONCRETO fijo para toda la serie, o null = cualquiera disponible. */
  professionalId: string | null
  /** Cuántas sesiones MÁS proponer después del ancla (normalmente total - 1). */
  remaining: number
  /** Días a saltar entre una sesión propuesta y la siguiente (según la cadencia elegida). */
  skipDays: number
  /** Huecos libres por fecha (YYYY-MM-DD), ya cargados en una sola consulta de rango. */
  shiftsByDate: Record<string, AvailabilityShift[]>
}

/**
 * Calcula las próximas `remaining` fechas consecutivas (avanzando `skipDays` días
 * y saltando el fin de semana, vía `advanceDate`) y, para cada una, busca un hueco
 * libre a la MISMA hora que el ancla. Si el profesional es concreto, exige ese
 * profesional; si es "cualquiera", prioriza el profesional del ancla (continuidad)
 * y si no está libre ese día, acepta cualquier otro profesional con esa hora libre.
 *
 * Una fecha sin hueco coincidente queda con `slot: null` — PENDIENTE — nunca se
 * inventa un horario. La UI la muestra para que la recepcionista la resuelva a mano.
 */
export function proposeConsecutiveSessions(
  input: ProposeConsecutiveSessionsInput,
): ProposedSession[] {
  const {
    anchorDate,
    anchorLabel,
    anchorProfessionalId,
    professionalId,
    remaining,
    skipDays,
    shiftsByDate,
  } = input

  const sessions: ProposedSession[] = []
  let cursor = anchorDate

  for (let i = 0; i < remaining; i++) {
    cursor = advanceDate(cursor, skipDays)
    const shifts = shiftsByDate[cursor] ?? []

    const sameProfessional = anchorProfessionalId
      ? shifts.find((s) => s.open === anchorLabel && s.professional_id === anchorProfessionalId)
      : undefined
    const anyMatch = professionalId
      ? shifts.find((s) => s.open === anchorLabel && s.professional_id === professionalId)
      : shifts.find((s) => s.open === anchorLabel)
    const match = sameProfessional ?? anyMatch

    sessions.push({
      index: i + 2, // 1 = el ancla (no se recalcula acá)
      date: cursor,
      slot: match
        ? {
            start_at: match.slot_start_iso,
            end_at: match.slot_end_iso,
            date: cursor,
            label: match.open,
            professional_id: match.professional_id,
            professional_name: match.professional_name,
          }
        : null,
    })
  }

  return sessions
}
