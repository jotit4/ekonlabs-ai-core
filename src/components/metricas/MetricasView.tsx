'use client'

import type { ClinicKPIs, AgentKPIs } from '@/types/metricas'
import { KPICard } from './KPICard'
import { AgentKPIsSection } from './AgentKPIsSection'

interface MetricasViewProps {
  kpis: ClinicKPIs | null
  agentKpis?: AgentKPIs | null
  agentKpisError?: boolean
  periodoLabel: string
  isError?: boolean
  isPending?: boolean
}

export function MetricasView({
  kpis,
  agentKpis = null,
  agentKpisError = false,
  periodoLabel,
  isError = false,
  isPending = false,
}: MetricasViewProps) {
  if (isPending || isError || kpis === null) {
    if (isPending) {
      return null
    }
    return (
      <section aria-label="KPIs operativos" aria-live="polite">
        <header className="mb-6">
          <p className="text-sm text-[var(--color-text-secondary)]">{periodoLabel}</p>
        </header>
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <p className="text-[var(--color-text-secondary)]">
            No se pudieron cargar las métricas.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-[var(--radius-sm)] bg-[var(--color-interactive)] px-4 py-2 text-sm font-medium text-white"
          >
            Reintentar
          </button>
        </div>
      </section>
    )
  }

  // kpis is guaranteed non-null here by the guard above
  const sinDatos = kpis.turnos_mes === 0 && kpis.pacientes_nuevos === 0

  return (
    <>
      <section aria-label="KPIs operativos">
        <header className="mb-6">
          <p className="text-sm text-[var(--color-text-secondary)]">{periodoLabel}</p>
        </header>

        {sinDatos ? (
          <p className="text-center text-[var(--color-text-secondary)] py-8">
            Sin datos para el período seleccionado
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KPICard titulo="Turnos del mes" valor={kpis.turnos_mes} />
          <KPICard titulo="No-shows" valor={kpis.no_shows} />
          <KPICard
            titulo="Ocupación"
            valor={`${kpis.ocupacion_pct}%`}
            subtitulo={`${kpis.ocupacion_numerador} de ${kpis.ocupacion_denominador} turnos`}
          />
          <KPICard titulo="Pacientes nuevos" valor={kpis.pacientes_nuevos} />
        </div>
      </section>

      <section aria-label="KPIs del agente IA" className="mt-8">
        <h2 className="text-[18px] font-semibold text-[var(--color-text-primary)] mb-4">
          Agente IA
        </h2>
        <AgentKPIsSection kpis={agentKpis} isError={agentKpisError} />
      </section>
    </>
  )
}
