import { z } from 'zod'

// ── Story 9.3: CRUD de Profesionales ─────────────────────────────────────────

export const CreateProfessionalSchema = z.object({
  name: z.string().min(1, { error: 'El nombre es requerido' }).max(100, { error: 'Máximo 100 caracteres' }),
  email: z.string().email({ error: 'Email inválido' }),
  service_ids: z.array(z.string().uuid()).optional(),
})

export type CreateProfessionalFormValues = z.infer<typeof CreateProfessionalSchema>

export const UpdateProfessionalSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  active: z.boolean().optional(),
})

export type UpdateProfessionalFormValues = z.infer<typeof UpdateProfessionalSchema>
