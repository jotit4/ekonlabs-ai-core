'use client'

import { useTendenciasTurnos } from '@/hooks/use-tendencias-turnos'
import { TendenciasTurnosChart } from './TendenciasTurnosChart'

interface TendenciasTurnosSectionProps {
  periodoDesde: string
  periodoHasta: string
}

export function TendenciasTurnosSection({ periodoDesde, periodoHasta }: TendenciasTurnosSectionProps) {
  const { data, isLoading, isError, refetch } = useTendenciasTurnos(periodoDesde, periodoHasta)

  return (
    <section aria-label="Tendencias de turnos por semana" className="mt-8">
      <h2 className="text-[18px] font-semibold text-[var(--color-text-primary)] mb-4">
        Tendencias por semana
      </h2>
      <TendenciasTurnosChart
        data={data ?? null}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
      />
    </section>
  )
}
