import { z } from 'zod'

// ─── Datos clínicos de base del paciente (Story 14.4 — Epic 14 HCE) ───────────
// Schema del body del PUT /api/patients/[id]/clinical-data. Los 3 campos viven
// como columnas text nullable en `patients` (migración 042 — NO aplicada en prod,
// la aplica el usuario en EasyPanel).
//
// ESTRICTO (z.strictObject): rechaza claves desconocidas — en particular
// `patient_id`/`tenant_id`/`notes`/`full_name`/`clinical_notes`/`dni`
// (los ids se derivan en el server: patient del path param, tenant de la RLS;
// los campos administrativos van por el PATCH genérico de /api/patients/[id]).
//
// ⚠️ SEMÁNTICA DE ACTUALIZACIÓN PARCIAL (AC 1): clave AUSENTE en el body = no
// tocar ese campo; clave presente con ''/null = setear null. Zod v4 normaliza
// las claves ausentes a null en el output (el transform corre igual), por lo
// que el output parseado NO distingue ausente de null: el PUT construye el
// payload del UPDATE chequeando presencia de clave en el BODY CRUDO y tomando
// el valor normalizado (trim/null) de este schema.

// Texto opcional/nullable: trim, string vacío → null (contrato session-note.schema).
const optionalTrimmedText = z
  .string({ error: 'Debe ser texto' })
  .nullish()
  .transform((v) => {
    const trimmed = v?.trim()
    return trimmed ? trimmed : null
  })

export const patientClinicalDataSchema = z.strictObject({
  antecedentes: optionalTrimmedText,
  alergias: optionalTrimmedText,
  medicacion: optionalTrimmedText,
})

// Output normalizado (todas las claves presentes, vacíos → null).
export type PatientClinicalDataInput = z.output<typeof patientClinicalDataSchema>

// Claves clínicas válidas — única fuente para el chequeo de presencia del PUT.
export const PATIENT_CLINICAL_DATA_KEYS = ['antecedentes', 'alergias', 'medicacion'] as const
