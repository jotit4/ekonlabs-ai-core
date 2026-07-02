// Código de color de la Agenda — por ESTADO del turno.
//
// DECISIÓN CERRADA (ver docs/diagnostico-ux-isadi-2026-06-30.md §5): el color de
// la agenda representa el ESTADO del turno, NUNCA el profesional ni el servicio.
// El servicio se distingue por texto/ícono, no por color de fondo.
//
// Se centraliza acá para que la grilla (TurneroGrid), la leyenda (AgendaLegend)
// y la vista Mes (react-big-calendar) usen exactamente la misma paleta.

import type { AppointmentStatus } from '@/types/appointments'
import { STATUS_LABELS } from '@/types/appointments'

/**
 * Color hex por estado. Los hex se eligen para componer bien con sufijo alpha
 * en JS (ej. `${color}1a` como fondo tenue, borde sólido con el mismo color).
 */
export const STATUS_COLORS: Record<AppointmentStatus, string> = {
  confirmed: '#0071e3', // azul
  completed: '#34c759', // verde
  pending: '#8b5cf6', // violeta
  pending_calendar: '#8b5cf6', // violeta (mismo grupo que pending)
  rescheduled: '#f97316', // naranja
  no_show: '#ef4444', // rojo
  cancelled: '#8e8e93', // gris
}

const STATUS_FALLBACK_COLOR = '#8e8e93'

/** Color hex estable para un estado de turno. Total (nunca undefined). */
export function getStatusColor(status: AppointmentStatus): string {
  return STATUS_COLORS[status] ?? STATUS_FALLBACK_COLOR
}

/**
 * Orden de estados en la leyenda visible de la agenda. `pending_calendar` se
 * omite (comparte color/semántica con `pending` de cara a la recepcionista).
 */
export const STATUS_LEGEND_ORDER: AppointmentStatus[] = [
  'confirmed',
  'completed',
  'pending',
  'rescheduled',
  'no_show',
  'cancelled',
]

/** Ítems de leyenda ya resueltos (estado → {label, color}). */
export const STATUS_LEGEND_ITEMS = STATUS_LEGEND_ORDER.map((status) => ({
  status,
  label: STATUS_LABELS[status],
  color: STATUS_COLORS[status],
}))
