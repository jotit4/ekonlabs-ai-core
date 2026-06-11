import { z } from 'zod'

// ─── Plan de tratamiento (Story 14.2 — Epic 14 HCE) ───────────────────────────
// Schema del body del PUT /api/treatments/[id]/plan. 1:1 lógico con `treatments`
// (migración 040, UNIQUE treatment_id → upsert ON CONFLICT).
//
// ESTRICTO (z.strictObject): rechaza claves desconocidas — en particular
// `discharge_at`/`discharge_report` (alta = Story 14.6) y `tenant_id`/
// `patient_id`/`author_id` (NUNCA del body: tenant del JWT, patient derivado
// de la fila `treatments`, author = user.id de la sesión).
//
// CIE-10: formato básico por regex + normalización a MAYÚSCULAS. SIN catálogo
// (decisión del epic: texto libre con validación de formato; catálogo NO es MVP).

export const CIE10_REGEX = /^[A-Za-z][0-9]{2}(\.[0-9A-Za-z]{1,4})?$/

// Texto opcional/nullable: trim, string vacío → null.
const optionalTrimmedText = z
  .string({ error: 'Debe ser texto' })
  .nullish()
  .transform((v) => {
    const trimmed = v?.trim()
    return trimmed ? trimmed : null
  })

export const treatmentPlanInputSchema = z.strictObject({
  motivo_consulta: optionalTrimmedText,
  objetivo: optionalTrimmedText,
  cie10_code: z
    .string({ error: 'Debe ser texto' })
    .nullish()
    .transform((v) => {
      const trimmed = v?.trim()
      return trimmed ? trimmed.toUpperCase() : null
    })
    .refine((v) => v === null || CIE10_REGEX.test(v), {
      error: 'Código CIE-10 inválido (formato esperado: M54.5)',
    }),
  indicated_sessions: z
    .number({ error: 'Debe ser un número' })
    .int({ error: 'Debe ser un número entero' })
    .min(1, { error: 'Debe ser al menos 1' })
    .nullish()
    .transform((v) => v ?? null),
})

// Output normalizado (todas las claves presentes, vacíos → null).
export type TreatmentPlanInput = z.output<typeof treatmentPlanInputSchema>
// Input del formulario (react-hook-form + standardSchemaResolver).
export type TreatmentPlanFormValues = z.input<typeof treatmentPlanInputSchema>

// ─── Alta / informe final (Story 14.6 — Epic 14 HCE) ──────────────────────────
// Body del POST /api/treatments/[id]/discharge. El alta es un EVENTO, no una
// edición de campos: el ÚNICO dato que viaja es el informe final (requerido —
// el alta sin informe no cierra formalmente la HCE).
//
// ESTRICTO (z.strictObject): rechaza claves desconocidas — en particular
// `discharge_at` (lo setea el SERVER con new Date().toISOString(); aceptarlo
// del body habilitaría backdating), `tenant_id`/`patient_id`/`author_id`
// (nunca del body) y los 4 campos del plan (se editan por el PUT de 14.2).

export const treatmentDischargeInputSchema = z.strictObject({
  discharge_report: z
    .string({ error: 'El informe final debe ser texto' })
    .transform((v) => v.trim())
    .refine((v) => v.length > 0, {
      error: 'El informe final es obligatorio para dar el alta',
    }),
})

export type TreatmentDischargeInput = z.output<typeof treatmentDischargeInputSchema>
