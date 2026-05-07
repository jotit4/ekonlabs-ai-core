import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string()
    .min(1, { error: 'Ingresá tu email' })
    .email({ error: 'Ingresá un email válido' }),
  password: z.string()
    .min(1, { error: 'Ingresá tu contraseña' }),
})

export type LoginFormValues = z.infer<typeof loginSchema>
