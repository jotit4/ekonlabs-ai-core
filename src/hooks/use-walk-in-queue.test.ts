import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockUseList = vi.fn()
vi.mock('@refinedev/core', () => ({
  useList: (...args: unknown[]) => mockUseList(...args),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

// Realtime: no queremos abrir canales de verdad en el test.
const mockChannel = {
  on: vi.fn(function on(this: unknown) {
    return mockChannel
  }),
  subscribe: vi.fn(() => mockChannel),
}
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
    channel: () => mockChannel,
    removeChannel: vi.fn(),
  }),
}))

import { useWalkInQueue } from './use-walk-in-queue'

describe('useWalkInQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseList.mockReturnValue({
      query: { isPending: false, isError: false, refetch: vi.fn(), dataUpdatedAt: 1_700_000_000_000 },
      result: { data: [] },
    })
  })

  // Pedido ISADI 2026-07-24: los atendidos siguen en la lista (bloque de abajo),
  // así que la query trae también los 'completed' de hoy.
  it('filtra por status IN (confirmed, completed) — nunca cancelled ni no_show', () => {
    renderHook(() => useWalkInQueue('2026-07-24', 'svc-walkin'))

    const args = mockUseList.mock.calls[0][0] as {
      filters: { field: string; operator: string; value: unknown }[]
      sorters: { field: string; order: string }[]
      meta: { select: string }
    }

    const statusFilter = args.filters.find((f) => f.field === 'status')
    expect(statusFilter).toBeDefined()
    expect(statusFilter!.operator).toBe('in')
    expect(statusFilter!.value).toEqual(['confirmed', 'completed'])

    // El select tiene que traer `status`: la UI separa esperando de atendidos con él.
    expect(args.meta.select).toContain('status')
    // Y el orden que devuelve el hook es el de LLEGADA (asc); el LIFO lo hace la UI.
    expect(args.sorters).toEqual([{ field: 'start_at', order: 'asc' }])
  })

  it('no filtra por tenant_id (AR14: lo filtra la RLS) y sí por is_walk_in y servicio', () => {
    renderHook(() => useWalkInQueue('2026-07-24', 'svc-walkin'))
    const args = mockUseList.mock.calls[0][0] as { filters: { field: string; value: unknown }[] }
    const campos = args.filters.map((f) => f.field)
    expect(campos).not.toContain('tenant_id')
    expect(campos).toContain('is_walk_in')
    expect(campos).toContain('service_id')
  })

  it('expone dataUpdatedAt (lo usa el panel para caducar el estado optimista)', () => {
    const { result } = renderHook(() => useWalkInQueue('2026-07-24', 'svc-walkin'))
    expect(result.current.dataUpdatedAt).toBe(1_700_000_000_000)
  })

  it('devuelve la misma referencia de `queue` mientras el dato no cambie', () => {
    const data = [{ appointment_id: 'apt-1' }]
    mockUseList.mockReturnValue({
      query: { isPending: false, isError: false, refetch: vi.fn(), dataUpdatedAt: 1 },
      result: { data },
    })

    const { result, rerender } = renderHook(() => useWalkInQueue('2026-07-24', 'svc-walkin'))
    const primera = result.current.queue
    rerender()
    expect(result.current.queue).toBe(primera)
  })
})
