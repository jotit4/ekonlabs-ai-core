import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// ── Mock de @refinedev/core (useList) ─────────────────────────────────────────

const mockUseList = vi.fn()

vi.mock('@refinedev/core', () => ({
  useList: (...args: unknown[]) => mockUseList(...args),
}))

// ── Mock de fetch (endpoint de profesionales del servicio) ────────────────────

const mockFetch = vi.fn()
global.fetch = mockFetch as unknown as typeof fetch

import { useWalkInService } from './use-walk-in-service'

describe('useWalkInService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseList.mockReturnValue({ result: { data: [] } })
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: [] }) })
  })

  it('llama useList sobre "services" con filtros allow_walk_in=true y active=true (sin tenant_id, AR14)', () => {
    renderHook(() => useWalkInService())
    expect(mockUseList).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: 'services',
        filters: expect.arrayContaining([
          expect.objectContaining({ field: 'allow_walk_in', operator: 'eq', value: true }),
          expect.objectContaining({ field: 'active', operator: 'eq', value: true }),
        ]),
      }),
    )
    // AR14: los filtros no deben incluir tenant_id (lo filtra la RLS).
    const call = mockUseList.mock.calls[0][0] as { filters: { field: string }[] }
    expect(call.filters.map((f) => f.field)).not.toContain('tenant_id')
  })

  it('sin servicio walk-in (lista vacía) → devuelve null y NO consulta profesionales', () => {
    mockUseList.mockReturnValue({ result: { data: [] } })
    const { result } = renderHook(() => useWalkInService())
    expect(result.current).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('con servicio walk-in → devuelve { serviceId, professionalIds, defaultProfessionalId }', async () => {
    mockUseList.mockReturnValue({ result: { data: [{ service_id: 'svc-walkin' }] } })
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            { professional_id: 'prof-1', name: 'Juan Diego' },
            { professional_id: 'prof-2', name: 'Ana' },
          ],
        }),
    })

    const { result } = renderHook(() => useWalkInService())

    await waitFor(() => {
      expect(result.current?.professionalIds).toHaveLength(2)
    })
    expect(result.current?.serviceId).toBe('svc-walkin')
    expect(result.current?.professionalIds).toEqual(['prof-1', 'prof-2'])
    expect(result.current?.defaultProfessionalId).toBe('prof-1')
    expect(mockFetch).toHaveBeenCalledWith('/api/services/svc-walkin/profesionales')
  })

  it('servicio walk-in pero fetch de profesionales falla → serviceId presente, professionalIds vacío, defaultProfessionalId null', async () => {
    mockUseList.mockReturnValue({ result: { data: [{ service_id: 'svc-walkin' }] } })
    mockFetch.mockResolvedValue({ ok: false, json: () => Promise.resolve({}) })

    const { result } = renderHook(() => useWalkInService())

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled()
    })
    expect(result.current?.serviceId).toBe('svc-walkin')
    expect(result.current?.professionalIds).toEqual([])
    expect(result.current?.defaultProfessionalId).toBeNull()
  })
})
