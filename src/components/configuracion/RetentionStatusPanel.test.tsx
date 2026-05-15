import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ── Mocks hoisted ─────────────────────────────────────────────────────────────

const { mockUseRetentionStatus } = vi.hoisted(() => ({
  mockUseRetentionStatus: vi.fn(),
}))

vi.mock('@/hooks/use-retention-status', () => ({
  useRetentionStatus: mockUseRetentionStatus,
}))

import { RetentionStatusPanel } from './RetentionStatusPanel'
import type { RetentionStatusResult } from '@/types/retention'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeHookResult(overrides: Partial<{
  result: RetentionStatusResult | null
  isPending: boolean
  isError: boolean
  refetch: () => void
}> = {}) {
  return {
    result: null,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  }
}

// Usar noon UTC para evitar diferencias de zona horaria en el test
const okResult: RetentionStatusResult = {
  status: 'ok',
  data: {
    last_run_at: '2026-05-12T12:00:00Z',
    next_run_at: '2026-05-13T12:00:00Z',
    status: 'ok',
    records_purged_last_run: 42,
    error_message: null,
  },
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RetentionStatusPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('muestra skeleton cuando isPending es true', () => {
    mockUseRetentionStatus.mockReturnValue(makeHookResult({ isPending: true }))

    render(<RetentionStatusPanel />)

    expect(screen.getByRole('status', { name: 'Cargando estado de retención' })).toBeInTheDocument()
  })

  it('muestra las dos políticas siempre (audit_logs 90d + conversaciones 730d)', () => {
    mockUseRetentionStatus.mockReturnValue(makeHookResult({ result: okResult }))

    render(<RetentionStatusPanel />)

    expect(screen.getByText('Registros de auditoría')).toBeInTheDocument()
    expect(screen.getByText('Conversaciones')).toBeInTheDocument()
    expect(screen.getByText('90 días')).toBeInTheDocument()
    expect(screen.getByText('730 días')).toBeInTheDocument()
  })

  it('muestra badge "En operación" cuando data.status === "ok"', () => {
    mockUseRetentionStatus.mockReturnValue(makeHookResult({ result: okResult }))

    render(<RetentionStatusPanel />)

    expect(screen.getByText('En operación')).toBeInTheDocument()
  })

  it('muestra banner de degradación cuando result.status === "degraded"', () => {
    const degradedResult: RetentionStatusResult = {
      status: 'degraded',
      data: null,
      message: 'FastAPI no disponible',
    }
    mockUseRetentionStatus.mockReturnValue(makeHookResult({ result: degradedResult }))

    render(<RetentionStatusPanel />)

    expect(
      screen.getByText(/Estado del job no disponible temporalmente/i)
    ).toBeInTheDocument()
  })

  it('muestra aviso informativo cuando result.status === "not_implemented"', () => {
    const notImplementedResult: RetentionStatusResult = {
      status: 'not_implemented',
      data: null,
    }
    mockUseRetentionStatus.mockReturnValue(makeHookResult({ result: notImplementedResult }))

    render(<RetentionStatusPanel />)

    expect(
      screen.getByText(/monitoreo del job de retención estará disponible próximamente/i)
    ).toBeInTheDocument()
  })

  it('muestra banner de fallo del job cuando data.status === "failed"', () => {
    const failedResult: RetentionStatusResult = {
      status: 'ok',
      data: {
        last_run_at: '2026-05-11T03:00:00Z',
        next_run_at: '2026-05-12T03:00:00Z',
        status: 'failed',
        records_purged_last_run: null,
        error_message: 'Connection timeout al purgar audit_logs',
      },
    }
    mockUseRetentionStatus.mockReturnValue(makeHookResult({ result: failedResult }))

    render(<RetentionStatusPanel />)

    expect(screen.getByText('Último job falló')).toBeInTheDocument()
    expect(screen.getByText('Connection timeout al purgar audit_logs')).toBeInTheDocument()
  })

  it('muestra banner "Job atrasado" cuando data.status === "overdue"', () => {
    const overdueResult: RetentionStatusResult = {
      status: 'ok',
      data: {
        last_run_at: '2026-05-01T03:00:00Z',
        next_run_at: null,
        status: 'overdue',
        records_purged_last_run: null,
        error_message: null,
      },
    }
    mockUseRetentionStatus.mockReturnValue(makeHookResult({ result: overdueResult }))

    render(<RetentionStatusPanel />)

    expect(screen.getByText(/Job atrasado/i)).toBeInTheDocument()
  })

  it('muestra botón "Reintentar" cuando isError es true', () => {
    mockUseRetentionStatus.mockReturnValue(makeHookResult({ isError: true }))

    render(<RetentionStatusPanel />)

    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })

  it('botón Reintentar llama a refetch al hacer click', async () => {
    const mockRefetch = vi.fn()
    mockUseRetentionStatus.mockReturnValue(
      makeHookResult({ isError: true, refetch: mockRefetch })
    )

    render(<RetentionStatusPanel />)

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(mockRefetch).toHaveBeenCalledTimes(1)
  })

  it('las fechas se muestran con date-fns (formato dd/MM/yyyy HH:mm, no toLocaleDateString)', () => {
    mockUseRetentionStatus.mockReturnValue(makeHookResult({ result: okResult }))

    render(<RetentionStatusPanel />)

    // Verificar que las fechas se muestran en formato dd/MM/yyyy HH:mm (date-fns)
    // y no con toLocaleDateString (que produce formatos variables por locale del SO)
    // Buscamos por regex para ser independientes de la zona horaria del entorno de test
    const datePattern = /\d{2}\/\d{2}\/2026 \d{2}:\d{2}/
    const dateCells = screen.getAllByText(datePattern)
    // Debe haber al menos 2 fechas formateadas (last_run_at y next_run_at)
    expect(dateCells.length).toBeGreaterThanOrEqual(2)
  })
})
