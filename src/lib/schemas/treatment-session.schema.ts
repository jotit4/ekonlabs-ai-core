import { z } from 'zod'
import { HEX_COLOR_REGEX } from '@/lib/agenda/turnero-palette'

// ─── Agendar sesiones de un paquete — MANUAL Y FLEXIBLE (reclamo ISADI) ───────
// Body del POST /api/treatments/[id]/sessions: una LISTA de slots elegidos de la
// disponibilidad REAL del profesional+servicio del paquete. Cada slot es un par
// { start_at, end_at } en ISO UTC (los `slot_start_iso` / `slot_end_iso` que ya
// devuelve la RPC `check_clinic_availability` / 029). El profesional, el servicio
// y el paciente NO viajan en el body: se derivan del propio paquete (server-side)
// → la recepcionista no puede falsearlos y el candado anti-overbooking (RPC 029)
// se aplica al profesional REAL del paquete.

// Un slot elegido = el { start_at, end_at } de un hueco libre (029), más
// opcionalmente `professional_id` (Pedido A #2/#3 ISADI 2026-07-14): cuando el
// paquete NO tiene profesional fijo ("cualquier profesional disponible"), cada
// sesión resuelve su PROPIO profesional (del hueco elegido) — la ruta exige
// este campo en ese caso (ver /api/treatments/[id]/sessions/route.ts). Cuando
// el paquete SÍ tiene profesional fijo, este campo se ignora (se usa el del
// paquete, igual que antes).
export const sessionSlotSchema = z.object({
  start_at: z.string().min(1, { error: 'start_at requerido' }),
  end_at: z.string().min(1, { error: 'end_at requerido' }),
  professional_id: z.string().uuid({ error: 'professional_id inválido' }).optional(),
})

export type SessionSlotInput = z.infer<typeof sessionSlotSchema>

// Tope defensivo: una corrida agenda como mucho un puñado de sesiones a la vez
// (el bono típico es de 8–12). Limita el blast-radius si el body viene corrupto.
export const MAX_SESSIONS_PER_REQUEST = 60

// Color manual OPCIONAL de la TANDA completa (Pedido 6, ISADI 2026-07-14/16):
// un solo color por operación de agendado, aplicado a TODOS los turnos que se
// crean en esta corrida — no es por slot (a diferencia de `professional_id`,
// que sí varía sesión a sesión en modo "cualquier profesional"). Mismo formato
// que exige el CHECK de `appointments.color` (migración 051) y el mismo
// validador que usa el turno único (HEX_COLOR_REGEX / isValidHexColor de
// turnero-palette.ts). Sin elegir ninguno, las sesiones se crean sin color
// (comportamiento actual, sin cambios).
export const createSessionsApiSchema = z.object({
  slots: z
    .array(sessionSlotSchema)
    .min(1, { error: 'Elegí al menos un horario' })
    .max(MAX_SESSIONS_PER_REQUEST, { error: 'Demasiados horarios en una sola operación' }),
  color: z
    .string()
    .regex(HEX_COLOR_REGEX, { error: 'Color inválido (formato #RRGGBB)' })
    .optional(),
})

export type CreateSessionsApiBody = z.infer<typeof createSessionsApiSchema>
