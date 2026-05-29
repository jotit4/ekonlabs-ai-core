import { z } from 'zod'

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
})

export type NewAppointmentApiBody = z.infer<typeof newAppointmentApiSchema>
