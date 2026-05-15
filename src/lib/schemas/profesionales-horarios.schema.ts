import { z } from 'zod'

// ── Story 9.4: Horarios y Bloqueos de Profesionales ───────────────────────────

export const CreateProfessionalScheduleSchema = z.object({
  day_of_week: z.number().int().min(0).max(6),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, { error: 'Formato HH:mm requerido' }),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, { error: 'Formato HH:mm requerido' }),
}).refine(
  (data) => data.end_time > data.start_time,
  { error: 'La hora de fin debe ser posterior a la hora de inicio', path: ['end_time'] }
)

export type CreateProfessionalScheduleFormValues = z.infer<typeof CreateProfessionalScheduleSchema>

export const CreateBlockedTimeSchema = z.object({
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Formato YYYY-MM-DD requerido' }),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Formato YYYY-MM-DD requerido' }),
  reason: z.string().max(200, { error: 'Máximo 200 caracteres' }).optional(),
}).refine(
  (data) => data.date_to >= data.date_from,
  { error: 'La fecha de fin debe ser igual o posterior a la fecha de inicio', path: ['date_to'] }
)

export type CreateBlockedTimeFormValues = z.infer<typeof CreateBlockedTimeSchema>
