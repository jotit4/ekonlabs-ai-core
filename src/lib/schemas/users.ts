import { z } from 'zod'

export const createUserSchema = z.object({
  email: z
    .string()
    .min(1, { error: 'Ingresá un email' })
    .email({ error: 'Ingresá un email válido' }),
  full_name: z
    .string()
    .min(2, { error: 'El nombre debe tener al menos 2 caracteres' }),
  role: z.enum(['receptionist', 'doctor'], {
    error: 'Seleccioná un rol válido',
  }),
})

export type CreateUserFormValues = z.infer<typeof createUserSchema>
