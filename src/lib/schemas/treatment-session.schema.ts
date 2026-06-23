import { z } from 'zod'

// ─── Agendar sesiones de un paquete — MANUAL Y FLEXIBLE (reclamo ISADI) ───────
// Body del POST /api/treatments/[id]/sessions: una LISTA de slots elegidos de la
// disponibilidad REAL del profesional+servicio del paquete. Cada slot es un par
// { start_at, end_at } en ISO UTC (los `slot_start_iso` / `slot_end_iso` que ya
// devuelve la RPC `check_clinic_availability` / 029). El profesional, el servicio
// y el paciente NO viajan en el body: se derivan del propio paquete (server-side)
// → la recepcionista no puede falsearlos y el candado anti-overbooking (RPC 029)
// se aplica al profesional REAL del paquete.

// Un slot elegido = exactamente el { start_at, end_at } de un hueco libre (029).
export const sessionSlotSchema = z.object({
  start_at: z.string().min(1, { error: 'start_at requerido' }),
  end_at: z.string().min(1, { error: 'end_at requerido' }),
})

export type SessionSlotInput = z.infer<typeof sessionSlotSchema>

// Tope defensivo: una corrida agenda como mucho un puñado de sesiones a la vez
// (el bono típico es de 8–12). Limita el blast-radius si el body viene corrupto.
export const MAX_SESSIONS_PER_REQUEST = 60

export const createSessionsApiSchema = z.object({
  slots: z
    .array(sessionSlotSchema)
    .min(1, { error: 'Elegí al menos un horario' })
    .max(MAX_SESSIONS_PER_REQUEST, { error: 'Demasiados horarios en una sola operación' }),
})

export type CreateSessionsApiBody = z.infer<typeof createSessionsApiSchema>
