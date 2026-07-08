// Helpers puros de la "Ficha kinesiológica" imprimible (Fase 3).
// Sin dependencias de Supabase — testeables directamente.

import { differenceInYears, parseISO, isValid } from 'date-fns'
import type { FichaSessionRow } from '@/types/ficha'

/** Edad en años derivada de `date_of_birth`. null si no hay fecha o es inválida. */
export function calculateAge(
  dateOfBirth: string | null | undefined,
  referenceDate: Date = new Date(),
): number | null {
  if (!dateOfBirth) return null
  const dob = parseISO(dateOfBirth)
  if (!isValid(dob)) return null
  return differenceInYears(referenceDate, dob)
}

// ─── "Tratamiento" de la cabecera (treatment_plans.objetivo) ──────────────────

interface TreatmentPlanLike {
  objetivo: string | null
}

interface TreatmentForObjetivo {
  status: string
  created_at: string
  // PostgREST puede devolver el embed reverso como array u objeto según versión/cardinalidad.
  treatment_plans?: TreatmentPlanLike[] | TreatmentPlanLike | null
}

function extractObjetivo(tp: TreatmentForObjetivo['treatment_plans']): string | null {
  if (!tp) return null
  if (Array.isArray(tp)) return tp[0]?.objetivo ?? null
  return tp.objetivo ?? null
}

/**
 * Elige el "Tratamiento" (objetivo) a mostrar en la cabecera de la ficha cuando el
 * paciente tiene varios bonos/tratamientos: prioriza el más reciente ACTIVO con
 * objetivo cargado; si ninguno activo tiene objetivo, cae al más reciente que sí
 * lo tenga (de cualquier status). null si ninguno tiene objetivo cargado.
 */
export function pickTratamientoObjetivo(treatments: TreatmentForObjetivo[]): string | null {
  const conObjetivo = treatments.filter((t) => extractObjetivo(t.treatment_plans) !== null)
  if (conObjetivo.length === 0) return null

  const activos = conObjetivo.filter((t) => t.status === 'active')
  const pool = activos.length > 0 ? activos : conObjetivo

  const masReciente = [...pool].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0]

  return extractObjetivo(masReciente.treatment_plans)
}

// ─── "Control de sesiones" — grilla 1..total_sessions por tratamiento ─────────

interface SessionAppointmentLike {
  session_index: number | null
  start_at: string
  status: string
}

/**
 * Construye la grilla de sesiones 1..total_sessions de un tratamiento, ubicando
 * cada turno real (reverse-join appointments por package_id) en su posición por
 * `session_index`. Sesiones sin turno agendado quedan con start_at/status null
 * (la vista las pinta como "pendiente").
 */
export function buildSessionRows(
  totalSessions: number,
  appointments: SessionAppointmentLike[],
): FichaSessionRow[] {
  const total = Math.max(0, totalSessions)
  const bySessionIndex = new Map<number, { start_at: string; status: string }>()

  for (const apt of appointments) {
    if (apt.session_index == null) continue
    // Si hay duplicados en el mismo índice (no debería pasar), se queda el primero.
    if (!bySessionIndex.has(apt.session_index)) {
      bySessionIndex.set(apt.session_index, { start_at: apt.start_at, status: apt.status })
    }
  }

  const rows: FichaSessionRow[] = []
  for (let i = 1; i <= total; i++) {
    const match = bySessionIndex.get(i)
    rows.push({
      session_index: i,
      start_at: match?.start_at ?? null,
      status: match?.status ?? null,
    })
  }
  return rows
}
