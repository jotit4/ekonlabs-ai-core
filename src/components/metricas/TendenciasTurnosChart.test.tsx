import { vi, describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { TendenciasTurnosChart } from './TendenciasTurnosChart'
import type { TendenciasTurnosData } from '@/types/metricas'

// ── Mock de recharts (SVG pesado, jsdom incompatible) ──────────────────────────
vi.mock('recharts', () => ({
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
}))

// ── Datos de prueba ────────────────────────────────────────────────────────────

const MOCK_DATA: TendenciasTurnosData = {
  semanas: [
    {
      semana_inicio: '2026-05-04',
      semana_label: 'Sem 19',
      confirmados: 5,
      cancelados: 2,
      no_shows: 1,
      total: 8,
    },
    {
      semana_inicio: '2026-05-11',
      semana_label: 'Sem 20',
      confirmados: 3,
      cancelados: 1,
      no_shows: 0,
      total: 4,
    },
  ],
  periodo_desde: '2026-05-01T00:00:00-03:00',
  periodo_hasta: '2026-05-31T23:59:59-03:00',
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('TendenciasTurnosChart', () => {
  it('muestra skeleton cuando isLoading es true', () => {
    render(<TendenciasTurnosChart data={null} isLoading={true} />)

    const skeleton = screen.getByRole('status')
    expect(skeleton).toBeDefined()
    expect(skeleton.getAttribute('aria-label')).toBe('Cargando gráfico de tendencias')
  })

  it('muestra error state cuando isError es true', () => {
    render(<TendenciasTurnosChart data={null} isError={true} />)

    expect(screen.getByText('No se pudieron cargar las tendencias de turnos')).toBeDefined()
  })

  it('llama onRetry al hacer click en Reintentar', () => {
    const handleRetry = vi.fn()
    render(<TendenciasTurnosChart data={null} isError={true} onRetry={handleRetry} />)

    const btn = screen.getByRole('button', { name: 'Reintentar' })
    fireEvent.click(btn)

    expect(handleRetry).toHaveBeenCalledTimes(1)
  })

  it('no muestra el botón Reintentar si onRetry no se pasa', () => {
    render(<TendenciasTurnosChart data={null} isError={true} />)

    const btn = screen.queryByRole('button', { name: 'Reintentar' })
    expect(btn).toBeNull()
  })

  it('muestra "Sin turnos registrados" cuando semanas está vacío', () => {
    const emptyData: TendenciasTurnosData = {
      semanas: [],
      periodo_desde: '2026-05-01T00:00:00-03:00',
      periodo_hasta: '2026-05-31T23:59:59-03:00',
    }

    render(<TendenciasTurnosChart data={emptyData} />)

    expect(screen.getByText('Sin turnos registrados')).toBeDefined()
  })

  it('muestra "Sin turnos registrados" cuando data es null', () => {
    render(<TendenciasTurnosChart data={null} />)

    expect(screen.getByText('Sin turnos registrados')).toBeDefined()
  })

  it('renderiza el BarChart cuando hay datos', () => {
    render(<TendenciasTurnosChart data={MOCK_DATA} />)

    expect(screen.getByTestId('bar-chart')).toBeDefined()
  })

  it('aria-label del gráfico contiene "Gráfico de tendencias"', () => {
    render(<TendenciasTurnosChart data={MOCK_DATA} />)

    const wrapper = screen.getByRole('img')
    expect(wrapper.getAttribute('aria-label')).toContain('Gráfico de tendencias')
  })

  it('renderiza tabla alternativa sr-only con los datos correctos', () => {
    render(<TendenciasTurnosChart data={MOCK_DATA} />)

    // La tabla tiene clase sr-only pero existe en el DOM
    const tabla = document.querySelector('table')
    expect(tabla).toBeDefined()
    expect(tabla?.className).toContain('sr-only')

    // Verificar que las filas tienen los datos correctos
    const cells = document.querySelectorAll('tbody td')
    // Fila 1: Sem 19 | 5 | 2 | 1 | 8
    expect(cells[0].textContent).toBe('Sem 19')
    expect(cells[1].textContent).toBe('5')
    expect(cells[2].textContent).toBe('2')
    expect(cells[3].textContent).toBe('1')
    expect(cells[4].textContent).toBe('8')
    // Fila 2: Sem 20 | 3 | 1 | 0 | 4
    expect(cells[5].textContent).toBe('Sem 20')
    expect(cells[6].textContent).toBe('3')
    expect(cells[7].textContent).toBe('1')
    expect(cells[8].textContent).toBe('0')
    expect(cells[9].textContent).toBe('4')
  })

  it('tabla sr-only tiene caption "Tendencias de turnos por semana"', () => {
    render(<TendenciasTurnosChart data={MOCK_DATA} />)

    const caption = document.querySelector('caption')
    expect(caption?.textContent).toBe('Tendencias de turnos por semana')
  })
})
