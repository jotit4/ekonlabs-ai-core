import { z } from 'zod'

/**
 * @deprecated `system_prompt_override` se deprecó como fuente de config del agente
 * (Story 6.6). Se conserva sólo para el historial (Story 6.2). Nuevo schema: `ClinicConfigPatchSchema`.
 */
export const SystemPromptOverrideSchema = z.object({
  system_prompt_override: z
    .string()
    .max(10000, { error: 'El override no puede superar 10.000 caracteres' }),
})

export type SystemPromptOverrideFormValues = z.infer<typeof SystemPromptOverrideSchema>

// ── Schema canónico de config del agente (v2_clinic_configs — Story 6.6) ──────

const IaConfigFeaturesSchema = z
  .object({
    enable_new_appointment: z.boolean().optional(),
    enable_cancel: z.boolean().optional(),
    require_dni: z.boolean().optional(),
    require_obra_social: z.boolean().optional(),
  })
  .optional()

const IaConfigSchema = z
  .object({
    tone_base: z.string().max(50, { error: 'El tono no puede superar 50 caracteres' }).optional(),
    tone_length: z.number().int().min(1).max(3).optional(),
    identity: z.string().max(2000, { error: 'La identidad no puede superar 2.000 caracteres' }).optional(),
    constraints: z.string().max(2000, { error: 'Las restricciones no pueden superar 2.000 caracteres' }).optional(),
    features: IaConfigFeaturesSchema,
  })
  .optional()

const OperationsConfigSchema = z
  .object({
    min_notice_hours: z.number().int().min(0, { error: 'Debe ser 0 o mayor' }).optional(),
    future_window_days: z.number().int().min(0, { error: 'Debe ser 0 o mayor' }).optional(),
  })
  .optional()

/**
 * Schema de PATCH parcial para `/api/agente/config`. Todos los campos opcionales
 * (merge no destructivo, AC4). `standardSchema`-compatible (se usa con
 * `standardSchemaResolver`, NO `zodResolver`).
 */
export const ClinicConfigPatchSchema = z.object({
  agent_name: z.string().max(100, { error: 'El nombre no puede superar 100 caracteres' }).optional(),
  prompt_rules: z.string().max(10000, { error: 'Las reglas no pueden superar 10.000 caracteres' }).optional(),
  ia_config: IaConfigSchema,
  operations_config: OperationsConfigSchema,
})

export type ClinicConfigPatchFormValues = z.infer<typeof ClinicConfigPatchSchema>

// ── Base de conocimiento del agente (Story 6.7) ───────────────────────────────

/**
 * Schema de creación de entrada de la base de conocimiento. `content` requerido
 * (no vacío tras trim, ≤5.000 chars). `source_filename` ("tema") opcional, ≤120.
 * `standardSchema`-compatible (se usa con `standardSchemaResolver`, NO `zodResolver`).
 */
export const CreateKnowledgeSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, { error: 'El contenido es obligatorio' })
    .max(5000, { error: 'Máximo 5.000 caracteres' }),
  source_filename: z
    .string()
    .trim()
    .max(120, { error: 'El tema no puede superar 120 caracteres' })
    .optional(),
})

export type CreateKnowledgeFormValues = z.infer<typeof CreateKnowledgeSchema>

/**
 * Schema de edición de entrada. Ambos campos opcionales pero al menos uno debe
 * estar presente (`.refine`). Mismas reglas de longitud que la creación.
 */
export const UpdateKnowledgeSchema = z
  .object({
    content: z
      .string()
      .trim()
      .min(1, { error: 'El contenido es obligatorio' })
      .max(5000, { error: 'Máximo 5.000 caracteres' })
      .optional(),
    source_filename: z
      .string()
      .trim()
      .max(120, { error: 'El tema no puede superar 120 caracteres' })
      .optional(),
  })
  .refine(
    (data) => data.content !== undefined || data.source_filename !== undefined,
    { error: 'Nada que actualizar' },
  )

export type UpdateKnowledgeFormValues = z.infer<typeof UpdateKnowledgeSchema>

// ── Corrección del agente desde la bandeja (Story 6.8) ────────────────────────

/**
 * Schema del modal "¿Qué debería haber respondido?" (corrección desde la bandeja).
 * Sólo valida los campos editables del form: `correct_answer` (la respuesta correcta
 * que escribe la recepcionista) y `source_filename` ("tema"). El límite real de 5.000
 * chars se valida sobre el `content` compuesto (`buildCorreccionContent`) — acá un
 * `.max(4500)` defensivo deja margen para el prefijo "Consulta del paciente...".
 * `standardSchema`-compatible (se usa con `standardSchemaResolver`, NO `zodResolver`).
 */
export const CorreccionAgenteSchema = z.object({
  correct_answer: z
    .string()
    .trim()
    .min(1, { error: 'La respuesta es obligatoria' })
    .max(4500, { error: 'La respuesta es demasiado larga (máx. 4.500 caracteres)' }),
  source_filename: z
    .string()
    .trim()
    .max(120, { error: 'El tema no puede superar 120 caracteres' })
    .optional(),
})

export type CorreccionAgenteFormValues = z.infer<typeof CorreccionAgenteSchema>
