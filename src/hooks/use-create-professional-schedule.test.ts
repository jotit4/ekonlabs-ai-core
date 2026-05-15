import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const { mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}))

import { useCreateProfessionalSchedule } from './use-create-professional-schedule'
import type { CreateProfessionalSchedulePayload } from '@/types/profesionales-horarios'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
  return { Wrapper, invalidateSpy }
}

const VALID_PAYLOAD: CreateProfessionalSchedulePayload = {
  day_of_week: 0,
  start_time: '09:00',
  end_time: '18:00',
}

const SAMPLE_SCHEDULE = {
  schedule_id: 'sched-uuid-1',
  professional_id: 'prof-1',
  day_of_week: 0,
  start_time: '09:00:00',
  end_time: '18:00:00',
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useCreateProfessionalSchedule', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.restoreAllMocks() })

  it('llama POST /api/profesionales/${professionalId}/horarios con body correcto', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: SAMPLE_SCHEDULE }), { status: 201 })
    )

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useCreateProfessionalSchedule('prof-1'), { wrapper: Wrapper })

    await act(async () => { result.current.mutate(VALID_PAYLOAD) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/profesionales/prof-1/horarios',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(VALID_PAYLOAD),
      })
    )
  })

  it('llama toast.success al tener éxito', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: SAMPLE_SCHEDULE }), { status: 201 })
    )

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useCreateProfessionalSchedule('prof-1'), { wrapper: Wrapper })

    await act(async () => { result.current.mutate(VALID_PAYLOAD) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockToastSuccess).toHaveBeenCalledWith('Horario agregado correctamente')
  })

  it('llama toast.error con "solapa" cuando el servidor retorna 409 con mensaje de solapamiento', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Este horario se solapa con uno existente' }), { status: 409 })
    )

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useCreateProfessionalSchedule('prof-1'), { wrapper: Wrapper })

    await act(async () => { result.current.mutate(VALID_PAYLOAD) })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(mockToastError).toHaveBeenCalledWith('Este horario se solapa con uno existente')
  })

  it('llama toast.error con acción Reintentar en otros errores', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Error interno del servidor' }), { status: 500 })
    )

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useCreateProfessionalSchedule('prof-1'), { wrapper: Wrapper })

    await act(async () => { result.current.mutate(VALID_PAYLOAD) })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(mockToastError).toHaveBeenCalledWith(
      'Error al agregar el horario. Intentá de nuevo.',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Reintentar' }),
      })
    )
  })

  it('invalida [profesionales, professionalId, horarios] al tener éxito', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: SAMPLE_SCHEDULE }), { status: 201 })
    )

    const { Wrapper, invalidateSpy } = makeWrapper()
    const { result } = renderHook(() => useCreateProfessionalSchedule('prof-1'), { wrapper: Wrapper })

    await act(async () => { result.current.mutate(VALID_PAYLOAD) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['profesionales', 'prof-1', 'horarios'] })
  })
})
