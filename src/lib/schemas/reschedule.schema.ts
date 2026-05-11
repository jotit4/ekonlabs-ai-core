import { z } from 'zod'

// Schema para el formulario de reprogramación (client-side)
export const rescheduleSchema = z.object({
  appointment_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Fecha inválida (YYYY-MM-DD)' }),
  appointment_time_hhmm: z
    .string()
    .regex(/^\d{2}:\d{2}$/, { error: 'Horario inválido (HH:MM)' }),
})

export type RescheduleFormValues = z.infer<typeof rescheduleSchema>

// Schema para la API Route (body del PATCH)
export const rescheduleApiSchema = z.object({
  start_at: z.string().min(1, { error: 'start_at requerido' }),
  end_at: z.string().min(1, { error: 'end_at requerido' }),
})

export type RescheduleApiBody = z.infer<typeof rescheduleApiSchema>
