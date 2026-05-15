import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// ── Mocks hoisted ─────────────────────────────────────────────────────────────

const { mockPush, mockSearchParams, mockUseClinicKPIs, mockUseAgentKPIs } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockSearchParams: vi.fn(),
  mockUseClinicKPIs: vi.fn(),
  mockUseAgentKPIs: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: mockSearchParams,
  useRouter: vi.fn(() => ({ push: mockPush })),
}))

vi.mock('@/hooks/use-clinic-kpis', () => ({
  useClinicKPIs: mockUseClinicKPIs,
}))

vi.mock('@/hooks/use-agent-kpis', () => ({
  useAgentKPIs: mockUseAgentKPIs,
}))

vi.mock('@/components/metricas/FiltroFechasMetricas', () => ({
  FiltroFechasMetricas: ({
    periodoDesde,
    periodoHasta,
    esRangoPorDefecto,
    onAplicar,
    onLimpiar,
  }: {
    periodoDesde: string
    periodoHasta: string
    esRangoPorDefecto: boolean
    onAplicar: (d: string, h: string) => void
    onLimpiar: () => void
  }) => (
    <div
      data-testid="filtro-fechas"
      data-desde={periodoDesde}
      data-hasta={periodoHasta}
      data-por-defecto={esRangoPorDefecto ? 'true' : 'false'}
    >
      <button onClick={() => onAplicar('2026-05-01T00:00:00-03:00', '2026-05-31T23:59:59-03:00')}>
        Aplicar Test
      </button>
      <button onClick={() => onLimpiar()}>Limpiar Test</button>
    </div>
  ),
}))

vi.mock('@/components/metricas/MetricasView', () => ({
  MetricasView: ({ periodoLabel, isPending }: { periodoLabel: string; isPending?: boolean }) => (
    <div
      data-testid="metricas-view"
      data-periodo={periodoLabel}
      data-pending={isPending ? 'true' : 'false'}
    />
  ),
}))

vi.mock('@/components/metricas/TendenciasTurnosSection', () => ({
  TendenciasTurnosSection: ({ periodoDesde, periodoHasta }: { periodoDesde: string; periodoHasta: string }) => (
    <div data-testid="tendencias-section" data-desde={periodoDesde} data-hasta={periodoHasta} />
  ),
}))

vi.mock('@/components/metricas/DistribucionServiciosSection', () => ({
  DistribucionServiciosSection: ({
    periodoDesde,
    periodoHasta,
  }: {
    periodoDesde: string
    periodoHasta: string
  }) => (
    <div data-testid="distribucion-section" data-desde={periodoDesde} data-hasta={periodoHasta} />
  ),
}))

vi.mock('date-fns-tz', () => ({
  toZonedTime: vi.fn((d: Date) => d),
  formatInTimeZone: vi.fn().mockReturnValue('2026-05-01T00:00:00-03:00'),
}))

vi.mock('date-fns', () => ({
  startOfMonth: vi.fn((d: Date) => d),
  format: vi.fn().mockReturnValue('1 may'),
}))

import { MetricasClientWrapper } from './MetricasClientWrapper'

// ── Helpers ────────────────────────────────────────────────────────────────────

function setupMocks(searchParamsEntries: Record<string, string> = {}) {
  const sp = new URLSearchParams(searchParamsEntries)
  mockSearchParams.mockReturnValue(sp)
  mockUseClinicKPIs.mockReturnValue({ kpis: null, isPending: false, isError: false, refetch: vi.fn() })
  mockUseAgentKPIs.mockReturnValue({ kpis: null, isPending: false, isError: false, refetch: vi.fn() })
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('MetricasClientWrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('usa el rango por defecto (mes actual) cuando no hay params en URL', () => {
    setupMocks()
    render(<MetricasClientWrapper />)

    const filtro = screen.getByTestId('filtro-fechas')
    expect(filtro).toHaveAttribute('data-por-defecto', 'true')
  })

  it('usa los params desde/hasta de la URL cuando están presentes y son válidos', () => {
    setupMocks({ desde: '2026-04-01T00:00:00-03:00', hasta: '2026-04-30T23:59:59-03:00' })
    render(<MetricasClientWrapper />)

    const filtro = screen.getByTestId('filtro-fechas')
    expect(filtro).toHaveAttribute('data-desde', '2026-04-01T00:00:00-03:00')
    expect(filtro).toHaveAttribute('data-hasta', '2026-04-30T23:59:59-03:00')
    expect(filtro).toHaveAttribute('data-por-defecto', 'false')
  })

  it('usa el rango por defecto si los params de URL son inválidos (NaN)', () => {
    setupMocks({ desde: 'not-a-date', hasta: 'also-invalid' })
    render(<MetricasClientWrapper />)

    const filtro = screen.getByTestId('filtro-fechas')
    // Rango por defecto aplica cuando los params son inválidos
    // esRangoPorDefecto = false porque desdeURL existe (aunque sea inválido)
    // periodoDesde cae al default por isValidISO retornando false
    expect(filtro).toHaveAttribute('data-desde', '2026-05-01T00:00:00-03:00')
  })

  it('renderiza FiltroFechasMetricas con periodoDesde/periodoHasta', () => {
    setupMocks()
    render(<MetricasClientWrapper />)

    expect(screen.getByTestId('filtro-fechas')).toBeInTheDocument()
    const filtro = screen.getByTestId('filtro-fechas')
    expect(filtro).toHaveAttribute('data-desde')
    expect(filtro).toHaveAttribute('data-hasta')
  })

  it('renderiza MetricasView con periodoLabel "Este mes" cuando no hay params', () => {
    setupMocks()
    render(<MetricasClientWrapper />)

    const view = screen.getByTestId('metricas-view')
    expect(view).toHaveAttribute('data-periodo', 'Este mes')
  })

  it('renderiza MetricasView con periodoLabel derivado del rango cuando hay params', () => {
    setupMocks({ desde: '2026-04-01T00:00:00-03:00', hasta: '2026-04-30T23:59:59-03:00' })
    render(<MetricasClientWrapper />)

    const view = screen.getByTestId('metricas-view')
    // El label no es "Este mes" cuando hay params
    expect(view).not.toHaveAttribute('data-periodo', 'Este mes')
  })

  it('renderiza TendenciasTurnosSection', () => {
    setupMocks()
    render(<MetricasClientWrapper />)

    expect(screen.getByTestId('tendencias-section')).toBeInTheDocument()
  })

  it('renderiza DistribucionServiciosSection', () => {
    setupMocks()
    render(<MetricasClientWrapper />)

    expect(screen.getByTestId('distribucion-section')).toBeInTheDocument()
  })

  it('llama router.push con params cuando se aplica filtro', () => {
    setupMocks()
    render(<MetricasClientWrapper />)

    fireEvent.click(screen.getByText('Aplicar Test'))

    expect(mockPush).toHaveBeenCalledOnce()
    const calledUrl = mockPush.mock.calls[0][0] as string
    expect(calledUrl).toContain('/metricas?')
    expect(calledUrl).toContain('desde=')
    expect(calledUrl).toContain('hasta=')
  })

  it('llama router.push sin params cuando se limpia filtro', () => {
    setupMocks()
    render(<MetricasClientWrapper />)

    fireEvent.click(screen.getByText('Limpiar Test'))

    expect(mockPush).toHaveBeenCalledOnce()
    expect(mockPush).toHaveBeenCalledWith('/metricas')
  })

  it('pasa isPending=true a MetricasView cuando useClinicKPIs está pendiente', () => {
    const sp = new URLSearchParams()
    mockSearchParams.mockReturnValue(sp)
    mockUseClinicKPIs.mockReturnValue({ kpis: null, isPending: true, isError: false, refetch: vi.fn() })
    mockUseAgentKPIs.mockReturnValue({ kpis: null, isPending: false, isError: false, refetch: vi.fn() })

    render(<MetricasClientWrapper />)

    const view = screen.getByTestId('metricas-view')
    expect(view).toHaveAttribute('data-pending', 'true')
  })
})
