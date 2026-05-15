'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { TendenciasTurnosData } from '@/types/metricas'

// Colores del sistema de diseño (literales — recharts no acepta CSS vars en fill)
const COLORS = {
  confirmados: '#34c759',       // --color-status-ok
  cancelados: 'rgba(0,0,0,0.3)', // aproximar --color-text-secondary para barra visible
  no_shows: '#ff3b30',          // --color-status-alert
} as const

interface TendenciasTurnosChartProps {
  data: TendenciasTurnosData | null
  isLoading?: boolean
  isError?: boolean
  onRetry?: () => void
}

export function TendenciasTurnosChart({
  data,
  isLoading = false,
  isError = false,
  onRetry,
}: TendenciasTurnosChartProps) {
  // Estado loading — skeleton con forma del gráfico (UX-DR19)
  if (isLoading) {
    return (
      <div
        className="h-64 w-full animate-pulse rounded-[var(--radius-md)] bg-[#ebebed]"
        role="status"
        aria-label="Cargando gráfico de tendencias"
      />
    )
  }

  // Estado error
  if (isError) {
    return (
      <div className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-6 text-center border border-[var(--color-border)]">
        <p className="text-sm text-[var(--color-text-secondary)] mb-3">
          No se pudieron cargar las tendencias de turnos
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

  // Estado vacío (UX-DR20) — con altura fija para que la pantalla no salte
  const sinDatos = !data || data.semanas.length === 0
  if (sinDatos) {
    return (
      <div
        className="h-64 flex items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-surface)] border border-[var(--color-border)]"
      >
        <p className="text-sm text-[var(--color-text-secondary)]">Sin turnos registrados</p>
      </div>
    )
  }

  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-6 border border-[var(--color-border)]">
      {/* Gráfico recharts con alternativa accesible (UX-DR21) */}
      <div aria-label="Gráfico de tendencias de turnos por semana" role="img">
        <ResponsiveContainer width="100%" height={256}>
          <BarChart
            data={data.semanas}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis
              dataKey="semana_label"
              tick={{ fontSize: 12, fill: 'rgba(0,0,0,0.48)' }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 12, fill: 'rgba(0,0,0,0.48)' }}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: '1px solid rgba(0,0,0,0.08)',
                fontSize: 13,
              }}
              labelStyle={{ color: '#1d1d1f', fontWeight: 600 }}
            />
            <Legend
              wrapperStyle={{ fontSize: 13, color: 'rgba(0,0,0,0.48)' }}
            />
            <Bar
              dataKey="confirmados"
              name="Confirmados"
              stackId="a"
              fill={COLORS.confirmados}
              isAnimationActive={false}
            />
            <Bar
              dataKey="cancelados"
              name="Cancelados"
              stackId="a"
              fill={COLORS.cancelados}
              isAnimationActive={false}
            />
            <Bar
              dataKey="no_shows"
              name="No-shows"
              stackId="a"
              fill={COLORS.no_shows}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Alternativa textual accesible (UX-DR21, UX-DR23) */}
      <table className="sr-only">
        <caption>Tendencias de turnos por semana</caption>
        <thead>
          <tr>
            <th scope="col">Semana</th>
            <th scope="col">Confirmados</th>
            <th scope="col">Cancelados</th>
            <th scope="col">No-shows</th>
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {data.semanas.map((semana) => (
            <tr key={semana.semana_inicio}>
              <td>{semana.semana_label}</td>
              <td>{semana.confirmados}</td>
              <td>{semana.cancelados}</td>
              <td>{semana.no_shows}</td>
              <td>{semana.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
