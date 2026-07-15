import { z } from 'zod'
import { HEX_COLOR_REGEX } from '@/lib/agenda/turnero-palette'

// Color MANUAL opcional del turno (migración 051 — paleta muda del turnero
// Excel, ver turnero-palette.ts). Mismo formato que el CHECK de la DB.
const appointmentColorSchema = z
  .string()
  .regex(HEX_COLOR_REGEX, { error: 'Color inválido (formato #RRGGBB)' })

// Schema para la búsqueda de paciente (DNI, nombre o teléfono)
export const patientSearchSchema = z.object({
  query: z
    .string()
    .min(2, { error: 'Ingresá al menos 2 caracteres para buscar' })
    .max(100, { error: 'Búsqueda demasiado larga' }),
})

export type PatientSearchValues = z.infer<typeof patientSearchSchema>

// Schema para el formulario de nuevo turno (client-side)
export const newAppointmentSchema = z.object({
  patient_id: z.string().min(1, { error: 'Seleccioná un paciente' }),
  service_id: z.string().min(1, { error: 'Seleccioná un servicio' }),
  // Profesional elegido por el paciente — obligatorio (modelo por profesional)
  professional_id: z.string().min(1, { error: 'Seleccioná un profesional' }),
  appointment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Fecha inválida' }),
  appointment_time_hhmm: z
    .string()
    .regex(/^\d{2}:\d{2}$/, { error: 'Horario inválido' }),
})

export type NewAppointmentFormValues = z.infer<typeof newAppointmentSchema>

// Schema para la API Route (body del POST)
export const newAppointmentApiSchema = z.object({
  patient_id: z.string().uuid({ error: 'patient_id inválido' }),
  service_id: z.string().uuid({ error: 'service_id inválido' }),
  // professional_id obligatorio: el paciente elige el profesional (modelo por profesional)
  professional_id: z.string().uuid({ error: 'professional_id inválido' }),
  appointment_time: z.string().min(1, { error: 'appointment_time requerido' }),
  // appointment_time = ISO 8601 string construido en cliente: `${date}T${time}:00`
  duration_minutes: z.number().int().min(1, { error: 'duration_minutes requerido' }),
  // Color manual OPCIONAL (paleta muda — la recepcionista elige o deja sin color).
  color: appointmentColorSchema.optional(),
})

export type NewAppointmentApiBody = z.infer<typeof newAppointmentApiSchema>

// ─── Schema para la API Route de cambio de color (PATCH /api/appointments/[id]/color) ──
// `color: null` limpia el color manual (el turno vuelve a verse neutro). Un
// string debe cumplir el formato hex — no se restringe a los 16 de la paleta
// a nivel de schema (mismo criterio que la migración 051: el backend valida
// FORMATO, la paleta es solo lo que ofrece el selector de la UI).
export const appointmentColorApiSchema = z.object({
  color: appointmentColorSchema.nullable(),
})

export type AppointmentColorApiBody = z.infer<typeof appointmentColorApiSchema>
