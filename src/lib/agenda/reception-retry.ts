import type { AvailabilityShift } from '@/types/availability'

// Ítem B5 (resiliencia ante carreras) — turno único de recepción, grupo
// Fisioterapia: la UI colapsa varios profesionales libres a la misma hora
// (HH:MM) a UN solo representante (ver `receptionTimeOptions` en
// NewTurnoModal). Si ESE profesional se ocupó justo antes de confirmar
// (409 anti-overbooking, RPC 029), puede seguir habiendo OTRO profesional
// libre a la MISMA hora — no hace falta forzar a elegir otro horario.
//
// Esta función es pura y testeable por separado: a partir de una lista de
// huecos SIN colapsar (recién refrescada de /api/availability) devuelve, en
// orden, los huecos alternativos a `hhmm` cuyo profesional todavía no se
// intentó. De-duplica por professional_id (un mismo profesional no debería
// aparecer dos veces a la misma hora, pero por las dudas).
export function listAlternateProfessionalShifts(
  shifts: AvailabilityShift[],
  hhmm: string,
  excludeProfessionalId: string,
): AvailabilityShift[] {
  const seen = new Set<string>([excludeProfessionalId])
  const alternates: AvailabilityShift[] = []
  for (const shift of shifts) {
    if (shift.open !== hhmm) continue
    if (seen.has(shift.professional_id)) continue
    seen.add(shift.professional_id)
    alternates.push(shift)
  }
  return alternates
}
