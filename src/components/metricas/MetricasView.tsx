'use client'

import type { ClinicKPIs, AgentKPIs } from '@/types/metricas'
import { KPICard } from './KPICard'
import { AgentKPIsSection } from './AgentKPIsSection'
import { EmptyState } from '@/components/ui/empty-state'
import { BarChart3 } from 'lucide-react'

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
        <EmptyState
          icon={<BarChart3 className="h-6 w-6" />}
          title="No se pudieron cargar las métricas"
          description="Puede ser un problema temporal. Intentá recargar la página."
          action={{ label: 'Recargar', onClick: () => window.location.reload() }}
        />
      </section>
    )
  }

  // kpis is guaranteed non-null here by the guard above
  const sinDatos = kpis.turnos_mes === 0 && kpis.pacientes_nuevos === 0

  return (
    <>
      <section data-tour="metricas-operativos" aria-label="KPIs operativos">
        <header className="mb-6">
          <p className="text-sm text-[var(--color-text-secondary)]">{periodoLabel}</p>
        </header>

        {sinDatos ? (
          <EmptyState
            icon={<BarChart3 className="h-6 w-6" />}
            title="Sin datos para este período"
            description="No hay turnos ni actividad registrada en el rango de fechas seleccionado."
            className="mb-6"
          />
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

      <section data-tour="metricas-agente" aria-label="KPIs del agente IA" className="mt-8">
        <h2 className="text-[18px] font-semibold text-[var(--color-text-primary)] mb-4">
          Agente IA
        </h2>
        <AgentKPIsSection kpis={agentKpis} isError={agentKpisError} />
      </section>
    </>
  )
}
