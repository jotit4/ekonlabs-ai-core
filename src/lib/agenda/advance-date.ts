import { addDays, format, parseISO, isValid, getDay } from 'date-fns'

// Avanza `skip` días desde `fromISO` (YYYY-MM-DD), saltando el fin de semana
// (cae en lunes si toca sábado/domingo). SOLO calcula la fecha — no consulta
// disponibilidad ni reserva nada.
//
// Compartido por:
// - `MultiSessionScheduler` (cadencia MANUAL: adelanta el calendario tras cada
//   horario elegido a mano).
// - `proposeConsecutiveSessions` (Pedido B ISADI 2026-07-14: propuesta
//   automática de fechas consecutivas para bonos x5/x10, editable antes de
//   confirmar).
//
// Extraído a un módulo propio (antes vivía solo en MultiSessionScheduler) para
// que ambos consumidores reusen la MISMA lógica de calendario en vez de
// duplicarla.
export function advanceDate(fromISO: string, skip: number): string {
  const base = parseISO(fromISO)
  if (!isValid(base)) return fromISO
  let d = addDays(base, skip)
  const day = getDay(d) // 0=domingo … 6=sábado
  if (day === 6) d = addDays(d, 2)
  else if (day === 0) d = addDays(d, 1)
  return format(d, 'yyyy-MM-dd')
}
