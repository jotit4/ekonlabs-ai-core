import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// ── Mocks hoisted ─────────────────────────────────────────────────────────────

const { mockUseDeletionRequests, mockPush } = vi.hoisted(() => ({
  mockUseDeletionRequests: vi.fn(),
  mockPush: vi.fn(),
}))

vi.mock('@/hooks/use-deletion-requests', () => ({
  useDeletionRequests: mockUseDeletionRequests,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

import { DeletionRequestsPanel } from './DeletionRequestsPanel'
import type { DeletionRequestRow } from '@/types/deletion-requests'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeHookResult(overrides: Partial<{
  requests: DeletionRequestRow[]
  isPending: boolean
  isError: boolean
  refetch: () => void
}> = {}) {
  return {
    requests: [],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  }
}

const pendingRequest: DeletionRequestRow = {
  patient_id: 'p-uuid-1',
  full_name: 'Juan Pérez',
  dni: '12345678',
  deletion_requested_at: '2026-05-01T12:00:00Z',
  deletion_effective_at: '2026-05-31T12:00:00Z',
  status: 'pending',
}

const processedRequest: DeletionRequestRow = {
  patient_id: 'p-uuid-2',
  full_name: 'Ana García',
  dni: null,
  deletion_requested_at: '2026-03-01T12:00:00Z',
  deletion_effective_at: '2026-03-31T12:00:00Z',
  status: 'processed',
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DeletionRequestsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('muestra skeleton cuando isPending es true', () => {
    mockUseDeletionRequests.mockReturnValue(makeHookResult({ isPending: true }))

    render(<DeletionRequestsPanel />)

    expect(
      screen.getByRole('status', { name: 'Cargando solicitudes de supresión' })
    ).toBeInTheDocument()
  })

  it('muestra mensaje vacío cuando requests es []', () => {
    mockUseDeletionRequests.mockReturnValue(makeHookResult({ requests: [] }))

    render(<DeletionRequestsPanel />)

    expect(
      screen.getByText('No hay solicitudes de supresión registradas.')
    ).toBeInTheDocument()
  })

  it('muestra banner de error + botón Reintentar cuando isError es true', () => {
    mockUseDeletionRequests.mockReturnValue(makeHookResult({ isError: true }))

    render(<DeletionRequestsPanel />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })

  it('botón Reintentar llama a refetch al hacer click', () => {
    const mockRefetch = vi.fn()
    mockUseDeletionRequests.mockReturnValue(makeHookResult({ isError: true, refetch: mockRefetch }))

    render(<DeletionRequestsPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(mockRefetch).toHaveBeenCalledTimes(1)
  })

  it('muestra tabla con columnas correctas cuando hay solicitudes', () => {
    mockUseDeletionRequests.mockReturnValue(
      makeHookResult({ requests: [pendingRequest, processedRequest] })
    )

    render(<DeletionRequestsPanel />)

    expect(screen.getByText('Paciente')).toBeInTheDocument()
    expect(screen.getByText('DNI parcial')).toBeInTheDocument()
    expect(screen.getByText('Fecha solicitud')).toBeInTheDocument()
    expect(screen.getByText('Fecha efectiva')).toBeInTheDocument()
    expect(screen.getByText('Estado')).toBeInTheDocument()
    expect(screen.getByText('Audit log')).toBeInTheDocument()
  })

  it("muestra badge 'Pendiente' (amarillo) cuando status === 'pending'", () => {
    mockUseDeletionRequests.mockReturnValue(
      makeHookResult({ requests: [pendingRequest] })
    )

    render(<DeletionRequestsPanel />)

    const badge = screen.getByText('Pendiente')
    expect(badge).toBeInTheDocument()
    // Verificar color amarillo (warning)
    expect(badge).toHaveStyle({ color: 'var(--color-status-warn)' })
  })

  it("muestra badge 'Procesada' (gris) cuando status === 'processed'", () => {
    mockUseDeletionRequests.mockReturnValue(
      makeHookResult({ requests: [processedRequest] })
    )

    render(<DeletionRequestsPanel />)

    const badge = screen.getByText('Procesada')
    expect(badge).toBeInTheDocument()
    // Verificar color gris (secondary)
    expect(badge).toHaveStyle({ color: 'var(--color-text-secondary)' })
  })

  it("muestra DNI parcial ('123···') y no el DNI completo", () => {
    mockUseDeletionRequests.mockReturnValue(
      makeHookResult({ requests: [pendingRequest] })
    )

    render(<DeletionRequestsPanel />)

    // Debe mostrar solo los primeros 3 dígitos + '···'
    expect(screen.getByText('123···')).toBeInTheDocument()
    // NO debe mostrar el DNI completo
    expect(screen.queryByText('12345678')).not.toBeInTheDocument()
  })

  it("muestra '—' para DNI null", () => {
    mockUseDeletionRequests.mockReturnValue(
      makeHookResult({ requests: [processedRequest] })
    )

    render(<DeletionRequestsPanel />)

    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it("botón 'Ver en auditoría' navega con query params ?action=patient_deleted&entity_id=...", () => {
    mockUseDeletionRequests.mockReturnValue(
      makeHookResult({ requests: [pendingRequest] })
    )

    render(<DeletionRequestsPanel />)

    const auditButton = screen.getByRole('button', { name: /ver en auditoría/i })
    fireEvent.click(auditButton)

    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining('/configuracion/auditoria?action=patient_deleted')
    )
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining(`entity_id=${pendingRequest.patient_id}`)
    )
  })

  it('las fechas se muestran con date-fns (formato dd/MM/yyyy, no toLocaleDateString)', () => {
    mockUseDeletionRequests.mockReturnValue(
      makeHookResult({ requests: [pendingRequest] })
    )

    render(<DeletionRequestsPanel />)

    // Verificar que las fechas se muestran en formato dd/MM/yyyy (date-fns)
    // y no con toLocaleDateString (que produce formatos variables por locale del SO)
    // Buscamos por regex para ser independientes de la zona horaria del entorno de test
    const datePattern = /\d{2}\/\d{2}\/2026/
    const dateCells = screen.getAllByText(datePattern)
    // Debe haber al menos 2 fechas formateadas (deletion_requested_at y deletion_effective_at)
    expect(dateCells.length).toBeGreaterThanOrEqual(2)
  })

  it('muestra nombre del paciente en la columna Paciente', () => {
    mockUseDeletionRequests.mockReturnValue(
      makeHookResult({ requests: [pendingRequest] })
    )

    render(<DeletionRequestsPanel />)

    expect(screen.getByText('Juan Pérez')).toBeInTheDocument()
  })
})
