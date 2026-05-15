import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AgentKPIsSection } from './AgentKPIsSection'
import type { AgentKPIs } from '@/types/metricas'

const MOCK_KPIS: AgentKPIs = {
  containment_rate: 75,
  escalaciones: 5,
  fallback_rate: null,
  response_time_avg_ms: 1500,
  total_conversaciones: 20,
  periodo_desde: '2026-05-01T00:00:00-03:00',
  periodo_hasta: '2026-05-13T12:00:00-03:00',
}

const NULL_KPIS: AgentKPIs = {
  containment_rate: null,
  escalaciones: 0,
  fallback_rate: null,
  response_time_avg_ms: null,
  total_conversaciones: 0,
  periodo_desde: '2026-05-01T00:00:00-03:00',
  periodo_hasta: '2026-05-13T12:00:00-03:00',
}

describe('AgentKPIsSection', () => {
  it('renderiza los 4 títulos de KPI cards', () => {
    render(<AgentKPIsSection kpis={MOCK_KPIS} />)
    expect(screen.getByText('Tasa de contención')).toBeInTheDocument()
    expect(screen.getByText('Escalaciones')).toBeInTheDocument()
    expect(screen.getByText('Fallback rate')).toBeInTheDocument()
    expect(screen.getByText('Tiempo de respuesta')).toBeInTheDocument()
  })

  it('muestra "Sin datos" para containment_rate null', () => {
    render(<AgentKPIsSection kpis={NULL_KPIS} />)
    // El valor de la card de "Tasa de contención" debe ser "Sin datos"
    const cards = screen.getAllByRole('article')
    // Primera card: Tasa de contención
    expect(cards[0]).toHaveTextContent('Sin datos')
  })

  it('muestra "Sin datos" para fallback_rate null', () => {
    render(<AgentKPIsSection kpis={MOCK_KPIS} />)
    // MOCK_KPIS tiene fallback_rate null — la card de Fallback rate debe mostrar "Sin datos"
    const cards = screen.getAllByRole('article')
    // Tercera card: Fallback rate
    expect(cards[2]).toHaveTextContent('Sin datos')
  })

  it('muestra "Sin datos" para response_time_avg_ms null', () => {
    render(<AgentKPIsSection kpis={NULL_KPIS} />)
    const cards = screen.getAllByRole('article')
    // Cuarta card: Tiempo de respuesta
    expect(cards[3]).toHaveTextContent('Sin datos')
  })

  it('muestra escalaciones = 0 como "0" no como "Sin datos"', () => {
    render(<AgentKPIsSection kpis={NULL_KPIS} />)
    const cards = screen.getAllByRole('article')
    // Segunda card: Escalaciones — valor 0 debe ser "0", NO "Sin datos"
    expect(cards[1]).toHaveTextContent('0')
    expect(cards[1]).not.toHaveTextContent('Sin datos')
  })

  it('muestra número de escalaciones correctamente', () => {
    render(<AgentKPIsSection kpis={MOCK_KPIS} />)
    const cards = screen.getAllByRole('article')
    // Segunda card: Escalaciones = 5
    expect(cards[1]).toHaveTextContent('5')
  })

  it('muestra tiempo de respuesta en segundos cuando > 1000ms', () => {
    render(<AgentKPIsSection kpis={MOCK_KPIS} />)
    // response_time_avg_ms = 1500 → "1.5s"
    expect(screen.getByText('1.5s')).toBeInTheDocument()
  })

  it('muestra tiempo de respuesta en ms cuando < 1000ms', () => {
    const kpisConTiempoCorto: AgentKPIs = {
      ...MOCK_KPIS,
      response_time_avg_ms: 800,
    }
    render(<AgentKPIsSection kpis={kpisConTiempoCorto} />)
    expect(screen.getByText('800ms')).toBeInTheDocument()
  })

  it('renderiza skeleton (KPICard con isLoading=true) cuando isLoading=true', () => {
    render(<AgentKPIsSection kpis={null} isLoading={true} />)
    // Con isLoading=true, KPICard muestra aria-label="Cargando métrica"
    const skeletons = screen.getAllByRole('status')
    expect(skeletons.length).toBe(4)
  })

  it('renderiza estado de error con mensaje y botón Reintentar', () => {
    render(<AgentKPIsSection kpis={null} isError={true} onRetry={vi.fn()} />)
    expect(screen.getByText(/No se pudieron cargar los KPIs del agente/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })

  it('llama a onRetry cuando se hace click en el botón Reintentar', () => {
    const onRetry = vi.fn()
    render(<AgentKPIsSection kpis={null} isError={true} onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
