import { z } from 'zod'

/**
 * Subtipo de atención (migración 056) — define la navegación por defecto:
 *  - 'walk_in'     → "Doctor-fila": atiende por orden de llegada. Entra a su día
 *                    en el Calendario (vista Día filtrada por él).
 *  - 'appointment' → "Doctor-turno": atiende por turnos. Entra a /mi-jornada.
 *
 * Solo aplica a usuarios que atienden pacientes; recepción va sin subtipo.
 */
export const ATTENTION_MODES = ['walk_in', 'appointment'] as const

export const attentionModeSchema = z.enum(ATTENTION_MODES, {
  error: 'Seleccioná un tipo de atención válido',
})

/** Etiquetas de UI — el usuario piensa en "Doctor-fila" / "Doctor-turno". */
export const ATTENTION_MODE_LABELS: Record<(typeof ATTENTION_MODES)[number], string> = {
  walk_in: 'Por orden de llegada (fila)',
  appointment: 'Por turnos',
}

export const createUserSchema = z
  .object({
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
    // Solo para doctores: a qué profesional queda vinculado el usuario. Sin este
    // vínculo no existe "su día" ni "Mi agenda" — por eso es obligatorio para el
    // rol doctor (refine de abajo).
    professional_id: z.uuid({ error: 'Seleccioná un profesional' }).optional(),
    attention_mode: attentionModeSchema.optional(),
  })
  .refine((data) => data.role !== 'doctor' || !!data.professional_id, {
    error: 'Un doctor tiene que estar vinculado a un profesional',
    path: ['professional_id'],
  })
  .refine((data) => data.role !== 'doctor' || !!data.attention_mode, {
    error: 'Elegí cómo atiende: por turnos o por orden de llegada',
    path: ['attention_mode'],
  })

export type CreateUserFormValues = z.infer<typeof createUserSchema>

/** PATCH de usuario: activar/desactivar y/o cambiar el subtipo de atención. */
export const updateUserSchema = z
  .object({
    is_active: z.boolean().optional(),
    attention_mode: attentionModeSchema.nullable().optional(),
  })
  .refine((d) => d.is_active !== undefined || d.attention_mode !== undefined, {
    error: 'No hay cambios para aplicar',
  })

export type UpdateUserValues = z.infer<typeof updateUserSchema>
