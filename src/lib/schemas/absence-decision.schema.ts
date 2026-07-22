import { z } from 'zod'
import type { AuditAction } from '@/lib/audit'

// ─── Decisión manual de la recepcionista al ausentarse una sesión de serie (Story 13.6) ───
//
// Cuando un turno con `package_id != null` (pertenece a un paquete/serie) se marca
// `no_show` o `cancelled` desde el dashboard, la recepcionista decide caso por caso:
//   - 'recover'  → NO descuenta `sessions_remaining` (queda pendiente de reagendar).
//   - 'consume'  → descuenta 1 de `treatments.sessions_remaining` (piso en 0).
//   - 'justify'  → NO descuenta; persiste un motivo en `appointments.cancellation_reason`.
//
// Este flujo es EXCLUSIVO del dashboard. La cancelación por WhatsApp del agente
// (Epic 12.3) NO dispara descuento ni esta lógica (límite duro, fuera de scope).
//
// NO usa `tenants.rules.absence_policy` ni ventana de aviso (enfoque determinista RECHAZADO).

export const ABSENCE_DECISIONS = ['recover', 'consume', 'justify'] as const
export type AbsenceDecision = (typeof ABSENCE_DECISIONS)[number]

// Mapeo de cada decisión a su AuditAction aditiva (Story 13.6).
export const ABSENCE_DECISION_AUDIT_ACTION: Record<AbsenceDecision, AuditAction> = {
  recover: 'treatment_session_recoverable',
  consume: 'treatment_session_consumed',
  justify: 'treatment_session_justified',
}

// Estados de entrada válidos para el ausentismo de una sesión de serie.
// (No incluye 'completed': confirmar asistencia NO es ausentismo y NO dispara decisión.)
export const ABSENCE_STATUSES = ['no_show', 'cancelled'] as const
export type AbsenceStatus = (typeof ABSENCE_STATUSES)[number]

// ─── Schema del BODY del PATCH /api/appointments/[id]/status (Story 13.6) ─────
//
// `status` sigue siendo obligatorio y restringido a cancelled|completed|no_show
// (comportamiento legacy intacto). `decision` y `note` son OPCIONALES: sólo
// aparecen cuando el turno es de serie y la recepcionista eligió una opción.
export const statusPatchBodySchema = z
  .object({
    status: z.enum(['cancelled', 'completed', 'no_show'], {
      error: 'status debe ser "cancelled", "completed" o "no_show"',
    }).optional(),
    decision: z.enum(ABSENCE_DECISIONS).optional(),
    note: z.string().optional(),
    is_undo: z.boolean().optional(),
  })
  .refine(
    // Si no es undo, status es obligatorio.
    (data) => data.is_undo === true || data.status !== undefined,
    { error: 'status es requerido', path: ['status'] }
  )
  .refine(
    // 'completed' (confirmar asistencia) NO admite decisión de ausentismo.
    (data) => !(data.decision !== undefined && data.status === 'completed'),
    { error: 'No se puede aplicar una decisión de ausentismo a un turno completado', path: ['decision'] },
  )
  .refine(
    // 'justify' requiere una nota no vacía.
    (data) => !(data.decision === 'justify' && (data.note === undefined || data.note.trim() === '')),
    { error: 'La justificación requiere un motivo no vacío', path: ['note'] },
  )

export type StatusPatchBody = z.infer<typeof statusPatchBodySchema>
