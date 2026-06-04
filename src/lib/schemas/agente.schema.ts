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
