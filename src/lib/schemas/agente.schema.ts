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

// ── Franjas horarias del agente de WhatsApp (booking_windows) ─────────────────
//
// Pedido ISADI (2026-07-14): la clínica atiende de 8 a 20, pero el agente de
// WhatsApp sólo puede ofrecer/agendar turnos dentro de estas franjas; fuera de
// ellas los turnos los da la recepcionista a mano. CONTRATO con el backend
// (ekonlabs-agent, prompt_builder/booking service):
//   - Horas LOCALES de la clínica, formato "HH:MM" 24h.
//   - Ausente, null o [] = SIN restricción (default actual: el agente puede
//     ofrecer cualquier horario dentro del horario de atención). No rompe
//     clínicas que no configuren franjas.
//   - Un turno debe caber ENTERO dentro de una franja (start <= inicio,
//     fin <= end) — esa comparación la hace el agente, no el dashboard.
//   - Aplica SOLO al canal del agente (WhatsApp); no limita a la recepción.
//   - Las franjas aplican a todos los días por igual (sin franjas por día).

const TIME_HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/** Máximo de franjas cargables — límite razonable para no saturar la UI. */
export const MAX_BOOKING_WINDOWS = 4

const TIME_FORMAT_ERROR = 'La hora debe tener el formato HH:MM (24 horas), por ejemplo 08:00'

/**
 * Una franja horaria en la que el agente de WhatsApp puede ofrecer/agendar
 * turnos. `start` debe ser estrictamente anterior a `end`.
 */
const BookingWindowSchema = z
  .object({
    start: z.string().regex(TIME_HHMM_RE, { error: TIME_FORMAT_ERROR }),
    end: z.string().regex(TIME_HHMM_RE, { error: TIME_FORMAT_ERROR }),
  })
  .refine((w) => w.start < w.end, {
    error: 'El horario de inicio debe ser anterior al horario de fin',
    path: ['end'],
  })

export type BookingWindowFormValues = z.infer<typeof BookingWindowSchema>

/**
 * Lista de franjas horarias. Ausente/null/vacía = sin restricción (ver
 * contrato arriba). Valida que no haya más de `MAX_BOOKING_WINDOWS` franjas
 * y que ninguna se solape con otra.
 */
const BookingWindowsSchema = z
  .array(BookingWindowSchema)
  .max(MAX_BOOKING_WINDOWS, {
    error: `No se pueden cargar más de ${MAX_BOOKING_WINDOWS} franjas horarias`,
  })
  .superRefine((windows, ctx) => {
    for (let i = 0; i < windows.length; i++) {
      for (let j = i + 1; j < windows.length; j++) {
        const a = windows[i]
        const b = windows[j]
        const overlap = a.start < b.end && b.start < a.end
        if (overlap) {
          ctx.addIssue({
            code: 'custom',
            message: 'Las franjas horarias no pueden superponerse entre sí',
            path: [j, 'start'],
          })
        }
      }
    }
  })
  .nullable()
  .optional()

const OperationsConfigSchema = z
  .object({
    min_notice_hours: z.number().int().min(0, { error: 'Debe ser 0 o mayor' }).optional(),
    future_window_days: z.number().int().min(0, { error: 'Debe ser 0 o mayor' }).optional(),
    booking_windows: BookingWindowsSchema,
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

// ── Knowledge Base por temas: propose + reindex (Story 6.9) ───────────────────

/**
 * Schema del flujo "proponer corrección" de la KB por temas
 * (`POST /api/agente/knowledge/propose`). El backend usa estos campos para
 * generar un diff propuesto (no persiste nada). `correction_note` es lo único
 * obligatorio. `standardSchema`-compatible (se usa con `standardSchemaResolver`,
 * NO `zodResolver`).
 */
export const KBProposeSchema = z.object({
  correction_note: z
    .string()
    .trim()
    .min(1, { error: 'La nota de corrección es obligatoria' })
    .max(4500, { error: 'La nota no puede superar 4.500 caracteres' }),
  patient_question: z.string().optional(),
  wrong_answer: z.string().optional(),
  target_topic: z
    .string()
    .trim()
    .max(120, { error: 'El tema no puede superar 120 caracteres' })
    .optional(),
})

export type KBProposeFormValues = z.infer<typeof KBProposeSchema>

/**
 * Schema de reindexado de un tema completo
 * (`PUT /api/agente/knowledge/topics/[source]`). El `content` reemplaza el texto
 * del tema entero y el backend re-chunkea + re-embebe.
 * `standardSchema`-compatible.
 */
export const KBTopicReindexSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, { error: 'El contenido es obligatorio' })
    .max(10000, { error: 'Máximo 10.000 caracteres' }),
})

export type KBTopicReindexFormValues = z.infer<typeof KBTopicReindexSchema>
