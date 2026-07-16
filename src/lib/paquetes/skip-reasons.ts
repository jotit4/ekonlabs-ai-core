// Motivo por el que el backend (RPC create_package_sessions, 054) saltea un
// slot al agendar sesiones de un paquete — traducido a lenguaje llano para la
// recepción. `reason` puede además venir como mensaje libre de
// create_appointment (029, p. ej. "professional_service_mismatch: ..."); en
// ese caso se muestra el texto tal cual (ver `describeSkipReason`).
//
// Extraído de `AgendarSesionModal` (deuda técnica — 201 parcial) para
// reusarlo en TODOS los flujos que confirman contra el mismo endpoint
// (`POST /api/treatments/[id]/sessions`): el submodal de agendado manual
// (`AgendarSesionModal`), el scheduler embebido de bonos 5/10 en
// `NewPaqueteModal` y la serie x5/x10 de `NewTurnoModal`.
export const SKIP_REASON_LABELS: Record<string, string> = {
  slot_conflict: 'ese horario ya estaba ocupado',
  no_capacity: 'se llenó el cupo del paquete',
  missing_professional: 'faltó asignar profesional',
  create_failed: 'no se pudo crear la sesión',
  link_error: 'error al vincular la sesión al paquete',
  treatment_not_found: 'el paquete ya no existe',
  treatment_not_active: 'el paquete ya no está activo',
}

export function describeSkipReason(reason: string): string {
  return SKIP_REASON_LABELS[reason] ?? reason
}

export interface SkippedSlot {
  start_at?: string
  reason: string
}

// Agrupa los `skipped` por motivo y arma un resumen legible, p. ej.
// "1 ese horario ya estaba ocupado, 1 se llenó el cupo del paquete".
export function summarizeSkipped(skipped: SkippedSlot[]): string {
  const counts = new Map<string, number>()
  for (const item of skipped) {
    counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([reason, count]) => `${count} ${describeSkipReason(reason)}`)
    .join(', ')
}
