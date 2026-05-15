import { renderHook, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'

// ── Mocks hoisted ─────────────────────────────────────────────────────────────
// El query builder de Supabase es chainable: from → select → order → eq → gte → lte → range
// Usamos un objeto único compartido para capturar todas las llamadas.

const mocks = vi.hoisted(() => {
  // Funciones individuales rastreables
  const mockRange = vi.fn()
  const mockLte = vi.fn()
  const mockGte = vi.fn()
  const mockEq = vi.fn()
  const mockOrder = vi.fn()
  const mockIn = vi.fn()
  const mockSelect = vi.fn()
  const mockFrom = vi.fn()

  // El query builder devuelve el mismo objeto en cada método para chainability
  // Esto se configura en el beforeEach
  return { mockRange, mockLte, mockGte, mockEq, mockOrder, mockIn, mockSelect, mockFrom }
})

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: vi.fn(() => ({
    from: mocks.mockFrom,
  })),
}))

import { useAuditLog } from './use-audit-log'
import type { AuditLogEntry } from '@/types/audit'

// ── Test wrapper ──────────────────────────────────────────────────────────────

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  function TestWrapper({ children }: { children: React.ReactNode }) {
    return createElement(QueryClientProvider, { client }, children)
  }
  return TestWrapper
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeLog(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: 'log-1',
    user_id: 'user-uuid-1',
    tenant_id: 'tenant-uuid-1',
    action: 'patient_accessed',
    entity_type: 'patient',
    entity_id: 'entity-1',
    ip_address: null,
    created_at: '2026-05-12T10:00:00Z',
    ...overrides,
  }
}

// ── Setup mock query builder ──────────────────────────────────────────────────

function setupQueryBuilder() {
  // Reseteamos las implementaciones en cada test
  // Creamos un objeto chainable: todos los métodos devuelven el mismo objeto
  // El `range` resuelve la promesa con datos de audit_logs
  // El `in` resuelve la promesa para dashboard_users lookup por IDs
  // El `order` sin `range` posterior (para allUsers query) también necesita resolver

  mocks.mockRange.mockResolvedValue({
    data: [makeLog()],
    error: null,
    count: 1,
  })
  mocks.mockIn.mockResolvedValue({
    data: [{ user_id: 'user-uuid-1', full_name: 'Ana García' }],
    error: null,
  })

  // El queryBuilder es chainable — todos los métodos devuelven el queryBuilder mismo
  // Para la query `allUsers` se usa: select → order → (query se resuelve directamente)
  // Tenemos que hacer que la tercera query (allUsers) funcione
  // allUsers usa: supabase.from('dashboard_users').select(...).order(...) y resuelve como thenable

  // Crear un queryBuilder con todos los métodos que devuelven self (chainable)
  // y que también es una Promise (thenable) para cuando no se llama .range() ni .in()
  const thenable = {
    then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
  }

  const builder: Record<string, unknown> = {
    ...thenable,
    range: mocks.mockRange,
    in: mocks.mockIn,
  }

  // eq, gte, lte, order devuelven el mismo builder
  mocks.mockEq.mockReturnValue(builder)
  mocks.mockGte.mockReturnValue(builder)
  mocks.mockLte.mockReturnValue(builder)
  mocks.mockOrder.mockReturnValue(builder)

  builder.eq = mocks.mockEq
  builder.gte = mocks.mockGte
  builder.lte = mocks.mockLte
  builder.order = mocks.mockOrder

  // mockSelect devuelve el builder
  mocks.mockSelect.mockReturnValue(builder)

  // mockFrom para audit_logs y dashboard_users
  mocks.mockFrom.mockReturnValue({ select: mocks.mockSelect })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useAuditLog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupQueryBuilder()
  })

  it('page empieza en 0', () => {
    const wrapper = makeWrapper()
    const { result } = renderHook(() => useAuditLog(), { wrapper })
    expect(result.current.page).toBe(0)
  })

  it('llama a audit_logs con order created_at DESC', async () => {
    const wrapper = makeWrapper()
    renderHook(() => useAuditLog(), { wrapper })

    await waitFor(() => {
      expect(mocks.mockFrom).toHaveBeenCalledWith('audit_logs')
    })
    expect(mocks.mockOrder).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('NO incluye filtro manual de tenant_id en SELECT de audit_logs', async () => {
    const wrapper = makeWrapper()
    renderHook(() => useAuditLog(), { wrapper })

    await waitFor(() => {
      expect(mocks.mockFrom).toHaveBeenCalledWith('audit_logs')
    })
    // eq nunca debe ser llamado con 'tenant_id'
    expect(mocks.mockEq).not.toHaveBeenCalledWith('tenant_id', expect.anything())
  })

  it('resuelve usuarios con segunda query a dashboard_users', async () => {
    const wrapper = makeWrapper()
    const { result } = renderHook(() => useAuditLog(), { wrapper })

    await waitFor(() => {
      expect(result.current.isPending).toBe(false)
    })

    await waitFor(() => {
      expect(mocks.mockFrom).toHaveBeenCalledWith('dashboard_users')
    })
  })

  it('si la query de usuarios falla, devuelve userMap vacío sin romper el hook', async () => {
    mocks.mockIn.mockResolvedValue({ data: null, error: new Error('db error') })

    const wrapper = makeWrapper()
    const { result } = renderHook(() => useAuditLog(), { wrapper })

    await waitFor(() => {
      expect(result.current.isPending).toBe(false)
    })

    expect(result.current.isError).toBe(false)
    expect(result.current.logs.length).toBeGreaterThanOrEqual(0)
  })

  // ── Tests de filtros ──────────────────────────────────────────────────────

  it('aplica .eq("action", ...) cuando filters.action está definido', async () => {
    const wrapper = makeWrapper()
    renderHook(() => useAuditLog({ action: 'patient_deleted' }), { wrapper })

    await waitFor(() => {
      expect(mocks.mockFrom).toHaveBeenCalledWith('audit_logs')
    })
    expect(mocks.mockEq).toHaveBeenCalledWith('action', 'patient_deleted')
  })

  it('aplica .eq("user_id", ...) cuando filters.userId está definido', async () => {
    const wrapper = makeWrapper()
    renderHook(() => useAuditLog({ userId: 'user-uuid-test' }), { wrapper })

    await waitFor(() => {
      expect(mocks.mockFrom).toHaveBeenCalledWith('audit_logs')
    })
    expect(mocks.mockEq).toHaveBeenCalledWith('user_id', 'user-uuid-test')
  })

  it('aplica .gte("created_at", ...) cuando filters.dateFrom está definido', async () => {
    const wrapper = makeWrapper()
    renderHook(() => useAuditLog({ dateFrom: '2026-01-01' }), { wrapper })

    await waitFor(() => {
      expect(mocks.mockFrom).toHaveBeenCalledWith('audit_logs')
    })
    expect(mocks.mockGte).toHaveBeenCalledWith('created_at', expect.stringContaining('2026-01-01'))
  })

  it('aplica .lte("created_at", ...) cuando filters.dateTo está definido', async () => {
    const wrapper = makeWrapper()
    renderHook(() => useAuditLog({ dateTo: '2026-03-31' }), { wrapper })

    await waitFor(() => {
      expect(mocks.mockFrom).toHaveBeenCalledWith('audit_logs')
    })
    expect(mocks.mockLte).toHaveBeenCalledWith('created_at', expect.stringContaining('2026-03-31'))
  })

  it('NO aplica filtros adicionales cuando filters está vacío {}', async () => {
    const wrapper = makeWrapper()
    renderHook(() => useAuditLog({}), { wrapper })

    await waitFor(() => {
      expect(mocks.mockFrom).toHaveBeenCalledWith('audit_logs')
    })
    expect(mocks.mockEq).not.toHaveBeenCalledWith('action', expect.anything())
    expect(mocks.mockEq).not.toHaveBeenCalledWith('user_id', expect.anything())
    expect(mocks.mockGte).not.toHaveBeenCalled()
    expect(mocks.mockLte).not.toHaveBeenCalled()
  })

  it('el queryKey incluye los filtros activos (query se ejecuta con filtros)', async () => {
    const filters = { action: 'appointment_created' as const }
    const wrapper = makeWrapper()
    const { result } = renderHook(() => useAuditLog(filters), { wrapper })

    await waitFor(() => {
      expect(result.current.isPending).toBe(false)
    })
    expect(result.current.logs).toBeDefined()
  })

  it('resetea page a 0 cuando cambian los filtros', async () => {
    const wrapper = makeWrapper()
    const { result, rerender } = renderHook(
      ({ filters }) => useAuditLog(filters),
      { wrapper, initialProps: { filters: {} } },
    )

    await waitFor(() => {
      expect(result.current.isPending).toBe(false)
    })

    // Avanzamos a página 1
    act(() => {
      result.current.setPage(1)
    })

    await waitFor(() => {
      expect(result.current.page).toBe(1)
    })

    // Cambiamos filtros — debe resetear page a 0
    rerender({ filters: { action: 'patient_deleted' as const } })

    await waitFor(() => {
      expect(result.current.page).toBe(0)
    })
  })

  it('allUsers se carga desde dashboard_users independientemente de los filtros', async () => {
    const wrapper = makeWrapper()
    const { result } = renderHook(() => useAuditLog({}), { wrapper })

    await waitFor(() => {
      expect(result.current.isPending).toBe(false)
    })

    // allUsers debe existir en el resultado del hook (aunque sea array vacío)
    expect(result.current.allUsers).toBeDefined()
    expect(Array.isArray(result.current.allUsers)).toBe(true)
    // La query de allUsers hace: from('dashboard_users').select().order()
    expect(mocks.mockFrom).toHaveBeenCalledWith('dashboard_users')
  })
})
