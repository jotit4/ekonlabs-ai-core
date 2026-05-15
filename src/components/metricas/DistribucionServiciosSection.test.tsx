import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { DistribucionServiciosData } from '@/types/metricas'

// ── Mock del hook ─────────────────────────────────────────────────────────────

const { mockUseDistribucionServicios } = vi.hoisted(() => ({
  mockUseDistribucionServicios: vi.fn(),
}))

vi.mock('@/hooks/use-distribucion-servicios', () => ({
  useDistribucionServicios: mockUseDistribucionServicios,
}))

import { DistribucionServiciosSection } from './DistribucionServiciosSection'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_DATA: DistribucionServiciosData = {
  servicios: [
    {
      service_id: 'svc-1',
      nombre: 'Consulta General',
      activo: true,
      total: 10,
      porcentaje: 67,
    },
    {
      service_id: 'svc-2',
      nombre: 'Radiología',
      activo: false,
      total: 5,
      porcentaje: 33,
    },
  ],
  total_turnos: 15,
  periodo_desde: '2026-05-01T00:00:00-03:00',
  periodo_hasta: '2026-05-13T12:00:00-03:00',
}

const DEFAULT_PROPS = {
  periodoDesde: '2026-05-01T00:00:00-03:00',
  periodoHasta: '2026-05-13T12:00:00-03:00',
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DistribucionServiciosSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('muestra skeleton cuando isPending es true', () => {
    mockUseDistribucionServicios.mockReturnValue({
      data: null,
      isPending: true,
      isError: false,
      refetch: vi.fn(),
    })

    render(<DistribucionServiciosSection {...DEFAULT_PROPS} />)

    const skeleton = screen.getByRole('status')
    expect(skeleton).toBeInTheDocument()
    expect(skeleton).toHaveAttribute('aria-label', 'Cargando distribución de servicios')
  })

  it('muestra error state cuando isError es true', () => {
    mockUseDistribucionServicios.mockReturnValue({
      data: null,
      isPending: false,
      isError: true,
      refetch: vi.fn(),
    })

    render(<DistribucionServiciosSection {...DEFAULT_PROPS} />)

    expect(screen.getByText(/No se pudo cargar/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reintentar/i })).toBeInTheDocument()
  })

  it('llama onRetry al hacer click en Reintentar', () => {
    const mockRefetch = vi.fn()
    mockUseDistribucionServicios.mockReturnValue({
      data: null,
      isPending: false,
      isError: true,
      refetch: mockRefetch,
    })

    render(<DistribucionServiciosSection {...DEFAULT_PROPS} />)

    fireEvent.click(screen.getByRole('button', { name: /Reintentar/i }))
    expect(mockRefetch).toHaveBeenCalledTimes(1)
  })

  it('muestra "Sin turnos registrados" cuando servicios está vacío', () => {
    mockUseDistribucionServicios.mockReturnValue({
      data: { ...MOCK_DATA, servicios: [], total_turnos: 0 },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(<DistribucionServiciosSection {...DEFAULT_PROPS} />)

    expect(screen.getByText('Sin turnos registrados')).toBeInTheDocument()
  })

  it('muestra "Sin turnos registrados" cuando total_turnos es 0', () => {
    mockUseDistribucionServicios.mockReturnValue({
      data: { ...MOCK_DATA, total_turnos: 0 },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(<DistribucionServiciosSection {...DEFAULT_PROPS} />)

    expect(screen.getByText('Sin turnos registrados')).toBeInTheDocument()
  })

  it('renderiza tabla cuando hay datos', () => {
    mockUseDistribucionServicios.mockReturnValue({
      data: MOCK_DATA,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(<DistribucionServiciosSection {...DEFAULT_PROPS} />)

    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('tabla tiene columnas: Servicio, Turnos, Porcentaje, Estado', () => {
    mockUseDistribucionServicios.mockReturnValue({
      data: MOCK_DATA,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(<DistribucionServiciosSection {...DEFAULT_PROPS} />)

    expect(screen.getByRole('columnheader', { name: 'Servicio' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Turnos' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Porcentaje' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Estado' })).toBeInTheDocument()
  })

  it('muestra "Histórico" para servicios con activo=false', () => {
    mockUseDistribucionServicios.mockReturnValue({
      data: MOCK_DATA,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(<DistribucionServiciosSection {...DEFAULT_PROPS} />)

    expect(screen.getByText('Histórico')).toBeInTheDocument()
  })

  it('muestra "Activo" para servicios con activo=true', () => {
    mockUseDistribucionServicios.mockReturnValue({
      data: MOCK_DATA,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(<DistribucionServiciosSection {...DEFAULT_PROPS} />)

    expect(screen.getByText('Activo')).toBeInTheDocument()
  })

  it('muestra "Sin servicio asignado" en itálica para service_id null', () => {
    const dataWithNull: DistribucionServiciosData = {
      servicios: [
        {
          service_id: null,
          nombre: 'Sin servicio asignado',
          activo: false,
          total: 3,
          porcentaje: 100,
        },
      ],
      total_turnos: 3,
      periodo_desde: DEFAULT_PROPS.periodoDesde,
      periodo_hasta: DEFAULT_PROPS.periodoHasta,
    }

    mockUseDistribucionServicios.mockReturnValue({
      data: dataWithNull,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(<DistribucionServiciosSection {...DEFAULT_PROPS} />)

    const italicEl = screen.getByText('Sin servicio asignado')
    expect(italicEl.tagName).toBe('SPAN')
    expect(italicEl).toHaveClass('italic')
  })

  it('muestra fila de totales con 100% y total_turnos', () => {
    mockUseDistribucionServicios.mockReturnValue({
      data: MOCK_DATA,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(<DistribucionServiciosSection {...DEFAULT_PROPS} />)

    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
    // total_turnos = 15 — debería aparecer como texto
    expect(screen.getByText('15')).toBeInTheDocument()
  })

  it('sección tiene aria-label="Distribución de turnos por servicio"', () => {
    mockUseDistribucionServicios.mockReturnValue({
      data: MOCK_DATA,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(<DistribucionServiciosSection {...DEFAULT_PROPS} />)

    const section = screen.getByRole('region', { name: 'Distribución de turnos por servicio' })
    expect(section).toBeInTheDocument()
  })
})
