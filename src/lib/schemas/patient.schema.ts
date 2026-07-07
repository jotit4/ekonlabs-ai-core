import { z } from 'zod'

// ─── PatientSearchSchema ─────────────────────────────────────────────────────
// Para búsqueda multi-campo en /pacientes (texto libre)

export const PatientSearchSchema = z.object({
  query: z.string().min(0).max(100),
})

export type PatientSearchValues = z.infer<typeof PatientSearchSchema>

// ─── ObraSocialFormSchema ────────────────────────────────────────────────────
// Para el selector en cascada de obra social (Story 3.3)
// El campo obra_social en DB sigue siendo TEXT — este schema es solo para el UI

export const ObraSocialFormSchema = z.object({
  entidad: z.string(),
  plan_nombre: z.string(),
})

export type ObraSocialFormValues = z.infer<typeof ObraSocialFormSchema>

// ─── PatientFormSchema ───────────────────────────────────────────────────────
// Para formulario de creación/edición de paciente (Story 3.2)
// Nota: DNI regex permite 7-8 dígitos o string vacío (campo opcional)
// Nota: Zod v4 usa { error: '...' } en lugar de { message: '...' }

export const PatientFormSchema = z.object({
  full_name: z.string().min(2, { error: 'El nombre debe tener al menos 2 caracteres' }),
  phone_number: z.string().min(7, { error: 'Ingresá un teléfono válido (mínimo 7 caracteres)' }),
  dni: z
    .string()
    .regex(/^\d{7,8}$/, { error: 'DNI inválido — debe tener 7 u 8 dígitos' })
    .or(z.literal(''))
    .optional(),
  date_of_birth: z.string().optional(),
  email: z
    .string()
    .email({ error: 'Email inválido' })
    .or(z.literal(''))
    .optional(),
  obra_social: z.string().optional(),
  obra_social_number: z.string().optional(),
  notes: z.string().optional(),
  reason_for_visit: z.string().optional(),
  alternative_phone: z.string().optional(),
  address: z.string().optional(),
  // Ficha de admisión (migración 047 — Fase 1 digitalización, campos ADMINISTRATIVOS)
  lugar: z.string().optional(),
  ocupacion: z.string().optional(),
  derivacion: z.string().optional(),
  actividad_fisica: z.string().optional(),
  // "KLGO a cargo" — <select> poblado con profesionales activos; '' = sin asignar
  primary_professional_id: z
    .string()
    .uuid({ error: 'Profesional inválido' })
    .or(z.literal(''))
    .optional(),
})

export type PatientFormValues = z.infer<typeof PatientFormSchema>

// Schema para API Route — mismo que PatientFormSchema (tenant_id viene del JWT, NO del body)
export const PatientApiSchema = PatientFormSchema
