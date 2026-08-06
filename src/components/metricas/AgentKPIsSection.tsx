'use client'

import type { AgentKPIs } from '@/types/metricas'
import { KPICard } from './KPICard'

interface AgentKPIsSectionProps {
  kpis: AgentKPIs | null
  isLoading?: boolean
  isError?: boolean
  onRetry?: () => void
}

/**
 * Formatea milisegundos a string legible.
 * - null → 'Sin datos'
 * - < 1000ms → '123ms'
 * - ≥ 1000ms → '1.5s'
 */
function formatTiempoRespuesta(ms: number | null): string {
  if (ms === null) return 'Sin datos'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/**
 * Formatea tasa porcentual.
 * - null → 'Sin datos'
 * - number → '75%'
 */
function formatRate(rate: number | null): string {
  if (rate === null) return 'Sin datos'
  return `${rate}%`
}

export function AgentKPIsSection({
  kpis,
  isLoading = false,
  isError = false,
  onRetry,
}: AgentKPIsSectionProps) {
  if (isError) {
    return (
      <div className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-6 text-center border border-[var(--color-border)]">
        <p className="text-sm text-[var(--color-text-secondary)] mb-3">
          No se pudieron cargar los KPIs del agente
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="text-sm text-[var(--color-interactive)] hover:underline"
          >
            Reintentar
          </button>
        )}
      </div>
    )
  }

  const containmentValue = formatRate(kpis?.containment_rate ?? null)
  const containmentSubtitulo =
    kpis?.containment_rate === null || kpis === null
      ? 'Datos no disponibles'
      : `${kpis.containment_rate}% resuelto por IA`

  const fallbackValue = formatRate(kpis?.fallback_rate ?? null)
  const fallbackSubtitulo =
    kpis?.fallback_rate === null || kpis === null
      ? 'Datos no disponibles'
      : `${kpis.fallback_rate}% no resuelto por el agente`

  const responseTimeValue = formatTiempoRespuesta(kpis?.response_time_avg_ms ?? null)
  const responseTimeSubtitulo =
    kpis?.response_time_avg_ms === null || kpis === null
      ? 'Datos no disponibles'
      : 'Tiempo promedio de respuesta'

  const escalacionesValue = kpis?.escalaciones ?? 0
  const escalacionesSubtitulo = 'Intervenciones manuales en el período'

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <KPICard
        titulo="Tasa de contención"
        valor={containmentValue}
        subtitulo={containmentSubtitulo}
        isLoading={isLoading}
      />
      <KPICard
        titulo="Intervenciones"
        valor={escalacionesValue}
        subtitulo={escalacionesSubtitulo}
        isLoading={isLoading}
      />
      <KPICard
        titulo="Respuestas de fallback"
        valor={fallbackValue}
        subtitulo={fallbackSubtitulo}
        isLoading={isLoading}
      />
      <KPICard
        titulo="Tiempo de respuesta"
        valor={responseTimeValue}
        subtitulo={responseTimeSubtitulo}
        isLoading={isLoading}
      />
    </div>
  )
}
