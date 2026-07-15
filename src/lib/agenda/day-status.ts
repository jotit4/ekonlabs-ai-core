// Regla de negocio "¿este día está abierto?" (pedido ISADI 2026-07-14).
//
// Espejo EXACTO en JS de la lógica que agrega la migración 052 a la RPC
// `check_clinic_availability` (SQL). Vive acá aparte para poder testearla de
// forma aislada y reusarla en la UI (badge de Semana/Mes) sin duplicar el
// criterio en cada componente.
//
// Regla (decisión de producto ya tomada, NO cambiar sin acuerdo explícito):
// - Si la clínica decidió algo para la fecha (is_open true/false) → manda la
//   decisión, sin importar si es feriado o no.
// - Si NO decidió nada y la fecha es un feriado nacional → CERRADO por
//   defecto (lado seguro: peor que no dar turnos es citar a un paciente en
//   una clínica cerrada).
// - Si NO decidió nada y NO es feriado → ABIERTO (comportamiento actual, sin
//   cambios para clínicas que no cargaron nada).

import type { DayStatusEntry } from '@/types/holidays'

export interface ComputeEffectiveOpenInput {
  isHoliday: boolean
  /** `null`/`undefined` = la clínica no decidió nada para esta fecha. */
  decisionIsOpen: boolean | null | undefined
}

export function computeEffectiveOpen({ isHoliday, decisionIsOpen }: ComputeEffectiveOpenInput): boolean {
  if (decisionIsOpen !== null && decisionIsOpen !== undefined) {
    return decisionIsOpen
  }
  if (isHoliday) {
    return false
  }
  return true
}

/** Tono visual del badge — mapea a `--color-status-{ok,warn,alert}` en la UI. */
export type DayStatusTone = 'closed' | 'holiday-open' | 'open-override'

export interface DayStatusBadgeInfo {
  text: string
  tone: DayStatusTone
  /** Texto largo para el `aria-label` / título del botón. */
  ariaLabel: string
}

/**
 * Info del badge a mostrar para un día "especial" (feriado y/o con decisión).
 * `null` = día normal sin nada que mostrar (no renderizar badge).
 *
 * `entry` ya viene con `effectiveOpen` calculado por el backend (mismo
 * criterio que `computeEffectiveOpen` arriba) — acá solo se decide el TEXTO y
 * el TONO, no se recalcula la regla.
 */
export function dayStatusBadge(entry: DayStatusEntry | null | undefined): DayStatusBadgeInfo | null {
  if (!entry) return null
  if (!entry.isHoliday && entry.decisionIsOpen === null) return null

  if (!entry.effectiveOpen) {
    const text = entry.isHoliday && entry.holidayName ? `Feriado: ${entry.holidayName}` : 'Cerrado'
    const ariaLabel = entry.isHoliday && entry.holidayName
      ? `Feriado nacional: ${entry.holidayName}. Cerrado. Click para decidir si abre.`
      : 'Día cerrado. Click para decidir si abre.'
    return { text, tone: 'closed', ariaLabel }
  }

  // effectiveOpen = true pero HAY entry → feriado con decisión "abre", o día
  // normal reabierto explícitamente tras haber estado cerrado.
  if (entry.isHoliday && entry.holidayName) {
    return {
      text: `Feriado: ${entry.holidayName} (abre)`,
      tone: 'holiday-open',
      ariaLabel: `Feriado nacional: ${entry.holidayName}. La clínica decidió abrir. Click para cambiar.`,
    }
  }
  return {
    text: 'Abre (excepción)',
    tone: 'open-override',
    ariaLabel: 'Día abierto por decisión de la clínica. Click para cambiar.',
  }
}
