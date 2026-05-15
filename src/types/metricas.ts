export interface ClinicKPIs {
  ocupacion_pct: number
  ocupacion_numerador: number
  ocupacion_denominador: number
  no_shows: number
  turnos_mes: number
  pacientes_nuevos: number
  periodo_desde: string
  periodo_hasta: string
}

export interface AgentKPIs {
  /** null = sin conversaciones en el período o sin datos */
  containment_rate: number | null
  /** siempre disponible (fuente: audit_logs) */
  escalaciones: number
  /** null = sin datos (FastAPI proxy en 501) */
  fallback_rate: number | null
  /** null = sin pares user→assistant en el período */
  response_time_avg_ms: number | null
  total_conversaciones: number
  periodo_desde: string
  periodo_hasta: string
}

export type MetricasPeriodo = 'hoy' | 'semana' | 'mes' | 'custom'

export interface WeeklyTrendData {
  semana_inicio: string    // ISO date "2026-05-11" — lunes de la semana
  semana_label: string     // "Sem 18" — para eje X del gráfico
  confirmados: number      // confirmed + completed
  cancelados: number       // cancelled
  no_shows: number         // no_show
  total: number            // suma de todos los estados
}

export interface TendenciasTurnosData {
  semanas: WeeklyTrendData[]
  periodo_desde: string
  periodo_hasta: string
}

export interface DistribucionServicioItem {
  service_id: string | null  // null = turnos sin servicio asignado
  nombre: string             // nombre del servicio o "Sin servicio asignado"
  activo: boolean            // false = servicio desactivado (aparece como "Histórico")
  total: number              // cantidad de turnos en el período
  porcentaje: number         // porcentaje redondeado del total (Math.round)
}

export interface DistribucionServiciosData {
  servicios: DistribucionServicioItem[]
  total_turnos: number
  periodo_desde: string
  periodo_hasta: string
}
