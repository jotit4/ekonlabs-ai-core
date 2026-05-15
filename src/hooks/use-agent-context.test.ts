import { renderHook } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mockear react-query completo
const mockUseQuery = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}))

import { useAgentContext } from './use-agent-context'

describe('useAgentContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('usa query key ["agent-context", phone]', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    renderHook(() => useAgentContext('+5491111111111'))
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['agent-context', '+5491111111111'],
      })
    )
  })

  it('enabled es false cuando phone está vacío', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false, isError: false })
    renderHook(() => useAgentContext(''))
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false })
    )
  })

  it('context es null cuando la API retorna { context: null }', () => {
    mockUseQuery.mockReturnValue({ data: { context: null }, isLoading: false, isError: false })
    const { result } = renderHook(() => useAgentContext('+5491111111111'))
    expect(result.current.context).toBeNull()
  })

  it('context tiene datos cuando la API responde correctamente', () => {
    const agentContext = {
      patient_name: 'Juan Pérez',
      phone_number: '+5491111111111',
      detected_intent: 'agendar_turno',
      dni: '30123456',
    }
    mockUseQuery.mockReturnValue({
      data: { context: agentContext },
      isLoading: false,
      isError: false,
    })
    const { result } = renderHook(() => useAgentContext('+5491111111111'))
    expect(result.current.context).toEqual(agentContext)
    expect(result.current.context?.patient_name).toBe('Juan Pérez')
  })

  it('isLoading es true durante fetch inicial', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    const { result } = renderHook(() => useAgentContext('+5491111111111'))
    expect(result.current.isLoading).toBe(true)
  })

  it('isError es true cuando fetch falla con error de red', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    const { result } = renderHook(() => useAgentContext('+5491111111111'))
    expect(result.current.isError).toBe(true)
  })
})
