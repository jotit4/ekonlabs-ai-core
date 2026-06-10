import { z } from 'zod'

// ─── Evolución por sesión (Story 14.3 — Epic 14 HCE) ──────────────────────────
// Schema del body del PUT /api/appointments/[id]/session-note. 1:1 con el turno
// (migración 041, UNIQUE appointment_id → upsert ON CONFLICT).
//
// ESTRICTO (z.strictObject): rechaza claves desconocidas — en particular
// `appointment_id`/`treatment_id`/`tenant_id`/`patient_id`/`author_id`
// (NUNCA del body: tenant del JWT, appointment del path param, patient y
// treatment derivados de la fila `appointments`, author = user.id de la sesión).

// Texto opcional/nullable: trim, string vacío → null.
const optionalTrimmedText = z
  .string({ error: 'Debe ser texto' })
  .nullish()
  .transform((v) => {
    const trimmed = v?.trim()
    return trimmed ? trimmed : null
  })

export const sessionNoteInputSchema = z.strictObject({
  worked_on: optionalTrimmedText,
  progress: optionalTrimmedText,
})

// Output normalizado (todas las claves presentes, vacíos → null).
export type SessionNoteInput = z.output<typeof sessionNoteInputSchema>
