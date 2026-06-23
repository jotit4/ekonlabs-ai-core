import { z } from 'zod'

// ─── Patrón de slots semanales (domain-tratamiento-clinico.md §3.2) ───────────
// day_of_week: 0=lunes … 6=domingo (misma convención ISODOW-1 que professional_schedules / 029).
// time: "HH:MM" 24h.
//
// SIMPLIFICACIÓN (paquetes-simplificados): el slot ya NO lleva profesional propio.
// UN solo profesional atiende TODO el paquete (campo `professional_id` del treatment).
// Los slots sólo definen día + hora. La generación/disponibilidad usa el profesional
// del paquete. Sábados (5) y domingos (6) se EXCLUYEN al generar (no se agendan).
//
// El profesional se inyecta a cada slot en la API/generación (no viene del form),
// por eso `professional_id` permanece en el TIPO `WeeklySlot` que consume la serie,
// pero el SCHEMA del slot de entrada ya no lo exige.

export const weeklySlotSchema = z.object({
  day_of_week: z
    .number({ error: 'Seleccioná un día' })
    .int({ error: 'Día inválido' })
    .min(0, { error: 'Día inválido' })
    .max(6, { error: 'Día inválido' }),
  time: z.string().regex(/^\d{2}:\d{2}$/, { error: 'Horario inválido' }),
})

// El tipo que consume la generación de la serie SÍ necesita el profesional del slot
// (la RPC de disponibilidad/candado es POR PROFESIONAL). Se deriva del profesional
// único del paquete al construir el plan, no del input del formulario.
export type WeeklySlot = z.infer<typeof weeklySlotSchema> & { professional_id: string }

// El patrón debe tener AL MENOS 1 slot (soporta 1, 2 o 3+).
export const patternSchema = z.object({
  slots: z.array(weeklySlotSchema).min(1, { error: 'Agregá al menos un slot' }),
})

export type TreatmentPattern = z.infer<typeof patternSchema>

// ─── Schema para la API Route (body del POST /api/treatments) ─────────────────
// Crea SOLO el BONO (fila `treatments`) con 0 sesiones agendadas. Las sesiones se
// agendan después, MANUAL Y FLEXIBLE, eligiendo de la disponibilidad real (reclamo
// ISADI). YA NO se genera la serie por patrón semanal: el body no lleva `pattern`
// ni `start_date` (la fecha de inicio del bono la setea el server = hoy; el patrón
// persistido es vacío para satisfacer el NOT NULL de la columna `pattern`).
export const newTreatmentApiSchema = z.object({
  patient_id: z.string().uuid({ error: 'patient_id inválido' }),
  service_id: z.string().uuid({ error: 'service_id inválido' }),
  // professional_id principal del paquete (obligatorio en el body de la API)
  professional_id: z.string().uuid({ error: 'professional_id inválido' }),
  total_sessions: z
    .number({ error: 'total_sessions requerido' })
    .int({ error: 'total_sessions debe ser entero' })
    .positive({ error: 'total_sessions debe ser mayor a 0' }),
  expires_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'expires_at inválido' })
    .optional(),
})

export type NewTreatmentApiBody = z.infer<typeof newTreatmentApiSchema>

// ─── Schema para el formulario (client-side, react-hook-form) ─────────────────
// El form crea SOLO el BONO: paciente, servicio, profesional, total de sesiones y
// vencimiento (opcional). NO pide patrón semanal (días/horas) ni fecha de inicio:
// las sesiones se agendan después, una a una o varias, eligiendo de la
// disponibilidad real (reclamo ISADI — el patrón semanal confundía a la clínica).
export const newTreatmentFormSchema = z.object({
  patient_id: z.string().min(1, { error: 'Seleccioná un paciente' }),
  service_id: z.string().min(1, { error: 'Seleccioná un servicio' }),
  professional_id: z.string().min(1, { error: 'Seleccioná un profesional principal' }),
  total_sessions: z
    .number({ error: 'Ingresá el total de sesiones' })
    .int({ error: 'El total de sesiones debe ser un número entero' })
    .positive({ error: 'El total de sesiones debe ser mayor a 0' }),
  expires_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Fecha de vencimiento inválida' })
    .optional()
    .or(z.literal('')),
})

export type NewTreatmentFormValues = z.infer<typeof newTreatmentFormSchema>

// Labels de día en español (0=Lunes … 6=Domingo) para la UI. No invertir la convención.
export const DAY_OF_WEEK_LABELS: { value: number; label: string }[] = [
  { value: 0, label: 'Lunes' },
  { value: 1, label: 'Martes' },
  { value: 2, label: 'Miércoles' },
  { value: 3, label: 'Jueves' },
  { value: 4, label: 'Viernes' },
  { value: 5, label: 'Sábado' },
  { value: 6, label: 'Domingo' },
]
