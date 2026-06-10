import { z } from 'zod'

// Schema para el formulario de reprogramación (client-side)
export const rescheduleSchema = z.object({
  appointment_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Fecha inválida (YYYY-MM-DD)' }),
  appointment_time_hhmm: z
    .string()
    .regex(/^\d{2}:\d{2}$/, { error: 'Horario inválido (HH:MM)' }),
  // Story 13.4 — reasignación OPCIONAL del profesional de la sesión.
  // Cadena vacía = "mantener profesional actual" (no reasignar). El valor proviene
  // de un <select> poblado con profesionales válidos; el formato UUID lo valida el
  // schema de la API (rescheduleApiSchema) antes del UPDATE.
  professional_id: z.string().optional(),
})

export type RescheduleFormValues = z.infer<typeof rescheduleSchema>

// Schema para la API Route (body del PATCH)
export const rescheduleApiSchema = z.object({
  start_at: z.string().min(1, { error: 'start_at requerido' }),
  end_at: z.string().min(1, { error: 'end_at requerido' }),
  // Story 13.4 — OPCIONAL: reasignar el profesional de esa sesión puntual.
  // Si no se envía, el comportamiento es idéntico al reschedule actual (sin regresión).
  professional_id: z.string().uuid({ error: 'professional_id inválido' }).optional(),
})

export type RescheduleApiBody = z.infer<typeof rescheduleApiSchema>
