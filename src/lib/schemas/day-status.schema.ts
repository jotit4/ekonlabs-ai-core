import { z } from 'zod'

// ─── Decisión de la clínica "¿este día abre?" (pedido ISADI 2026-07-14) ───────
//
// Body de POST /api/agenda/day-status. Un solo endpoint sirve para decidir un
// feriado nacional ("sí, abrimos") o cerrar a mano un día que NO es feriado
// (ej. corte de agua) — `is_open` cubre ambos casos, no hay dos schemas.
export const setClinicDayStatusSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Formato YYYY-MM-DD requerido' }),
  is_open: z.boolean({ error: 'is_open es requerido (true = abre, false = no abre)' }),
  reason: z.string().max(200, { error: 'Máximo 200 caracteres' }).optional(),
})

export type SetClinicDayStatusBody = z.infer<typeof setClinicDayStatusSchema>
