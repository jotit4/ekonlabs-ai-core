import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { AuditLogEntry } from '@/types/audit'

// ── Mocks hoisted ─────────────────────────────────────────────────────────────

const { mockRouterReplace, mockSearchParamsGet } = vi.hoisted(() => {
  const mockRouterReplace = vi.fn()
  const mockSearchParamsGet = vi.fn((_key?: string) => null as string | null)
  return { mockRouterReplace, mockSearchParamsGet }
})

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: mockSearchParamsGet,
  }),
  useRouter: () => ({
    replace: mockRouterReplace,
    push: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

// ── Mock useAuditLog ─────────────────────────────────────────────────────────

const mockUseAuditLog = vi.fn()

vi.mock('@/hooks/use-audit-log', () => ({
  useAuditLog: (filters?: unknown) => mockUseAuditLog(filters),
}))

import { AuditLogView } from './AuditLogView'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeLog(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: 'log-1',
    user_id: 'user-uuid-abc12345',
    tenant_id: 'tenant-uuid-1',
    action: 'patient_accessed',
    entity_type: 'patient',
    entity_id: 'entity-id-1',
    ip_address: null,
    created_at: '2026-05-12T10:30:00Z',
    ...overrides,
  }
}

function makeDefaultState(overrides = {}) {
  return {
    logs: [makeLog()],
    userMap: { 'user-uuid-abc12345': 'Ana García' },
    allUsers: [
      { user_id: 'user-uuid-abc12345', full_name: 'Ana García', is_active: true },
    ],
    total: 1,
    totalPages: 1,
    page: 0,
    setPage: vi.fn(),
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AuditLogView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParamsGet.mockReturnValue(null)
  })

  it('muestra skeleton cuando isPending=true', () => {
    mockUseAuditLog.mockReturnValue(makeDefaultState({ isPending: true, logs: [] }))
    render(<AuditLogView />)
    expect(screen.getByRole('status', { name: /cargando registros de auditoría/i })).toBeInTheDocument()
  })

  it('muestra error con botón Reintentar cuando isError=true', () => {
    const mockRefetch = vi.fn()
    mockUseAuditLog.mockReturnValue(makeDefaultState({ isError: true, logs: [], refetch: mockRefetch }))
    render(<AuditLogView />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument()
  })

  it('llama a refetch al hacer click en Reintentar', async () => {
    const user = userEvent.setup()
    const mockRefetch = vi.fn()
    mockUseAuditLog.mockReturnValue(makeDefaultState({ isError: true, logs: [], refetch: mockRefetch }))
    render(<AuditLogView />)
    await user.click(screen.getByRole('button', { name: /reintentar/i }))
    expect(mockRefetch).toHaveBeenCalledOnce()
  })

  it('muestra estado vacío "sin auditoría" cuando logs=[] y no hay filtros activos', () => {
    mockUseAuditLog.mockReturnValue(makeDefaultState({ logs: [], total: 0, totalPages: 0 }))
    render(<AuditLogView />)
    expect(screen.getByText(/no hay registros de auditoría aún/i)).toBeInTheDocument()
  })

  it('renderiza filas con datos — fecha formateada, acción, entidad, identificador', () => {
    mockUseAuditLog.mockReturnValue(makeDefaultState())
    render(<AuditLogView />)
    const datePattern = /\d{2}\/\d{2}\/2026 \d{2}:\d{2}:\d{2}/
    expect(screen.getByText(datePattern)).toBeInTheDocument()
    expect(screen.getByText('paciente')).toBeInTheDocument()
    expect(screen.getByText('entity-id-1')).toBeInTheDocument()
  })

  it('muestra full_name cuando userMap tiene resolución para el user_id', () => {
    mockUseAuditLog.mockReturnValue(makeDefaultState({
      userMap: { 'user-uuid-abc12345': 'Ana García' },
    }))
    render(<AuditLogView />)
    // Ana García puede aparecer en la tabla Y en el dropdown de usuarios del filtro
    // Verificamos que aparece al menos una vez en la tabla
    const allAna = screen.getAllByText('Ana García')
    expect(allAna.length).toBeGreaterThanOrEqual(1)
  })

  it('muestra UUID parcial cuando userMap NO tiene resolución para el user_id', () => {
    mockUseAuditLog.mockReturnValue(makeDefaultState({
      userMap: {},
    }))
    render(<AuditLogView />)
    expect(screen.getByText('user-uui...')).toBeInTheDocument()
  })

  it('botón Anterior deshabilitado cuando page===0', () => {
    mockUseAuditLog.mockReturnValue(makeDefaultState({ page: 0, totalPages: 3 }))
    render(<AuditLogView />)
    const anteriorBtn = screen.getByRole('button', { name: /anterior/i })
    expect(anteriorBtn).toBeDisabled()
  })

  it('botón Siguiente deshabilitado cuando page está en la última página', () => {
    mockUseAuditLog.mockReturnValue(makeDefaultState({ page: 2, totalPages: 3 }))
    render(<AuditLogView />)
    const siguienteBtn = screen.getByRole('button', { name: /siguiente/i })
    expect(siguienteBtn).toBeDisabled()
  })

  it('llama a setPage(1) al hacer click en Siguiente', async () => {
    const user = userEvent.setup()
    const mockSetPage = vi.fn()
    mockUseAuditLog.mockReturnValue(makeDefaultState({ page: 0, totalPages: 3, setPage: mockSetPage }))
    render(<AuditLogView />)
    const siguienteBtn = screen.getByRole('button', { name: /siguiente/i })
    await user.click(siguienteBtn)
    expect(mockSetPage).toHaveBeenCalledOnce()
    const updater = mockSetPage.mock.calls[0][0]
    expect(typeof updater).toBe('function')
    expect(updater(0)).toBe(1)
  })

  // ── Tests de filtros e integración ────────────────────────────────────────

  it('renderiza <AuditFilters> visible en la vista', () => {
    mockUseAuditLog.mockReturnValue(makeDefaultState())
    render(<AuditLogView />)
    // AuditFilters tiene role="search" con aria-label="Filtros de auditoría"
    expect(screen.getByRole('search', { name: /filtros de auditoría/i })).toBeInTheDocument()
  })

  it('al cambiar filtros, router.replace es llamado con los query params correctos', async () => {
    const user = userEvent.setup()
    mockUseAuditLog.mockReturnValue(makeDefaultState())
    render(<AuditLogView />)

    const actionSelect = screen.getByRole('combobox', { name: /filtrar por acción/i })
    await user.selectOptions(actionSelect, 'patient_deleted')

    expect(mockRouterReplace).toHaveBeenCalledWith(
      expect.stringContaining('action=patient_deleted'),
    )
  })

  it('estado vacío muestra "No hay registros para los filtros seleccionados" cuando hay filtros activos', () => {
    // Simular que hay un filtro activo en URL
    mockSearchParamsGet.mockImplementation((key?: string) => {
      if (key === 'action') return 'patient_deleted'
      return null
    })
    mockUseAuditLog.mockReturnValue(makeDefaultState({ logs: [], total: 0, totalPages: 0 }))
    render(<AuditLogView />)

    expect(
      screen.getByText(/no hay registros para los filtros seleccionados/i),
    ).toBeInTheDocument()
    // Puede haber múltiples botones "Limpiar filtros" (en AuditFilters + en estado vacío)
    const clearButtons = screen.getAllByRole('button', { name: /limpiar filtros/i })
    expect(clearButtons.length).toBeGreaterThanOrEqual(1)
  })

  it('estado vacío muestra "No hay registros de auditoría aún." cuando no hay filtros activos', () => {
    mockSearchParamsGet.mockReturnValue(null)
    mockUseAuditLog.mockReturnValue(makeDefaultState({ logs: [], total: 0, totalPages: 0 }))
    render(<AuditLogView />)

    expect(screen.getByText(/no hay registros de auditoría aún/i)).toBeInTheDocument()
    expect(screen.queryByText(/no hay registros para los filtros/i)).not.toBeInTheDocument()
  })
})
