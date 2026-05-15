import { z } from 'zod'

// ── Story 6.4: Horarios y Excepciones ─────────────────────────────────────────

export const CreateServiceHourSchema = z.object({
  day_of_week: z.number().int().min(0).max(6),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, { error: 'Formato HH:mm requerido' }),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, { error: 'Formato HH:mm requerido' }),
  slot_duration_minutes: z.number().int().min(5, { error: 'Mínimo 5 minutos' }).max(480, { error: 'Máximo 8 horas' }).optional(),
}).refine(
  (data) => data.end_time > data.start_time,
  { error: 'La hora de fin debe ser posterior a la hora de inicio', path: ['end_time'] }
)

export type CreateServiceHourFormValues = z.infer<typeof CreateServiceHourSchema>

export const CreateServiceExceptionSchema = z.object({
  exception_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Formato YYYY-MM-DD requerido' }),
  reason: z.string().max(200, { error: 'Máximo 200 caracteres' }).optional(),
})

export type CreateServiceExceptionFormValues = z.infer<typeof CreateServiceExceptionSchema>

// ── Story 6.3: Servicios ──────────────────────────────────────────────────────

export const CreateServiceSchema = z.object({
  name: z.string().min(1, { error: 'El nombre es requerido' }).max(100, { error: 'Máximo 100 caracteres' }),
  calendar_id: z.string().min(1, { error: 'El calendario Google es requerido' }),
  professional_name: z.string().max(100, { error: 'Máximo 100 caracteres' }).optional(),
  duration_minutes: z.number().int().min(5, { error: 'Mínimo 5 minutos' }).max(480, { error: 'Máximo 8 horas' }).optional(),
  booking_mode: z.enum(['appointment', 'walk_in', 'gated', 'cycle']).optional(),
})

export type CreateServiceFormValues = z.infer<typeof CreateServiceSchema>

export const UpdateServiceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  calendar_id: z.string().min(1).optional(),
  professional_name: z.string().max(100).optional(),
  duration_minutes: z.number().int().min(5).max(480).optional(),
  active: z.boolean().optional(),
  booking_mode: z.enum(['appointment', 'walk_in', 'gated', 'cycle']).optional(),
})

export type UpdateServiceFormValues = z.infer<typeof UpdateServiceSchema>
