import { z } from 'zod'

// Story 10.8 — Mi Perfil (autoservicio de datos del staff)

// PATCH /api/me/profile — datos de cuenta editables server-side (solo full_name)
export const UpdateProfileSchema = z.object({
  full_name: z
    .string()
    .min(2, { error: 'El nombre debe tener al menos 2 caracteres' }),
})
export type UpdateProfileValues = z.infer<typeof UpdateProfileSchema>

// PATCH /api/me/professional — nombre/email profesional propio (doctor)
// Ambos opcionales: el doctor puede actualizar uno u otro.
export const UpdateMyProfessionalSchema = z
  .object({
    name: z
      .string()
      .min(2, { error: 'El nombre debe tener al menos 2 caracteres' })
      .optional(),
    email: z.string().email({ error: 'Ingresá un email válido' }).optional(),
  })
  .refine((v) => v.name !== undefined || v.email !== undefined, {
    error: 'Indicá al menos un campo a actualizar',
  })
export type UpdateMyProfessionalValues = z.infer<typeof UpdateMyProfessionalSchema>
