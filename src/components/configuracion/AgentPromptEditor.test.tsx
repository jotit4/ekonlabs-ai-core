import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const { mockMutate, mockMutateAsync } = vi.hoisted(() => ({
  mockMutate: vi.fn(),
  mockMutateAsync: vi.fn(),
}))

vi.mock('@/hooks/use-agent-config', () => ({
  useAgentConfig: vi.fn(),
}))

vi.mock('@/hooks/use-update-prompt', () => ({
  useUpdatePrompt: vi.fn(),
}))

import { useAgentConfig } from '@/hooks/use-agent-config'
import { useUpdatePrompt } from '@/hooks/use-update-prompt'
import { AgentPromptEditor } from './AgentPromptEditor'
import type { TenantAgentConfig } from '@/types/agente'

// ── Datos de prueba ────────────────────────────────────────────────────────────

const MOCK_CONFIG: TenantAgentConfig = {
  tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4',
  system_prompt_override: 'Mi override de prueba',
  rules: { max_appointments: 3 },
  shadow_mode_enabled: false,
}

const MOCK_MUTATION_IDLE = {
  mutate: mockMutate,
  mutateAsync: mockMutateAsync,
  isPending: false,
  isPaused: false,
  isSuccess: false,
  isError: false,
  isIdle: true,
  status: 'idle' as const,
  data: undefined,
  error: null,
  reset: vi.fn(),
  variables: undefined,
  submittedAt: 0,
  failureCount: 0,
  failureReason: null,
  context: undefined,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AgentPromptEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default mutation mock
    vi.mocked(useUpdatePrompt).mockReturnValue(MOCK_MUTATION_IDLE as unknown as ReturnType<typeof useUpdatePrompt>)
  })

  it('muestra skeleton cuando isPending es true', () => {
    vi.mocked(useAgentConfig).mockReturnValue({
      config: null,
      isPending: true,
      isError: false,
      refetch: vi.fn(),
    })

    render(<AgentPromptEditor />)

    const skeleton = screen.getByRole('status')
    expect(skeleton).toHaveAttribute('aria-label', 'Cargando configuración del agente')
  })

  it('muestra banner de error + botón "Reintentar" cuando isError es true', () => {
    const mockRefetch = vi.fn()
    vi.mocked(useAgentConfig).mockReturnValue({
      config: null,
      isPending: false,
      isError: true,
      refetch: mockRefetch,
    })

    render(<AgentPromptEditor />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/error al cargar/i)).toBeInTheDocument()

    const retryBtn = screen.getByRole('button', { name: /reintentar/i })
    fireEvent.click(retryBtn)
    expect(mockRefetch).toHaveBeenCalledOnce()
  })

  it('renderiza textarea y preview cuando config carga correctamente', () => {
    vi.mocked(useAgentConfig).mockReturnValue({
      config: MOCK_CONFIG,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(<AgentPromptEditor />)

    const textarea = screen.getByRole('textbox')
    expect(textarea).toBeInTheDocument()
    expect(screen.getByText(/preview del prompt ensamblado/i)).toBeInTheDocument()
  })

  it('muestra 3 secciones de preview (base, reglas, override)', () => {
    vi.mocked(useAgentConfig).mockReturnValue({
      config: MOCK_CONFIG,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(<AgentPromptEditor />)

    expect(screen.getByText('Sistema base')).toBeInTheDocument()
    expect(screen.getByText('Reglas del tenant')).toBeInTheDocument()
    expect(screen.getByText('Override personalizado')).toBeInTheDocument()
    expect(screen.getByText('El prompt base está gestionado en el backend de IA y no es editable desde el dashboard.')).toBeInTheDocument()
  })

  it('preview de override se actualiza al escribir en el textarea', async () => {
    vi.mocked(useAgentConfig).mockReturnValue({
      config: { ...MOCK_CONFIG, system_prompt_override: '' },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(<AgentPromptEditor />)

    const textarea = screen.getByRole('textbox')
    await userEvent.clear(textarea)
    await userEvent.type(textarea, 'Nuevo texto de override')

    await waitFor(() => {
      expect(screen.getByText('Nuevo texto de override')).toBeInTheDocument()
    })
  })

  it('muestra error inline cuando override supera longitud máxima', async () => {
    vi.mocked(useAgentConfig).mockReturnValue({
      config: MOCK_CONFIG,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(<AgentPromptEditor />)

    const textarea = screen.getByRole('textbox')
    const longText = 'a'.repeat(10001)
    // Usar fireEvent.change para evitar el timeout de userEvent.type con muchos caracteres
    fireEvent.change(textarea, { target: { value: longText } })

    const submitBtn = screen.getByRole('button', { name: /guardar/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText(/10.000 caracteres/i)).toBeInTheDocument()
    })
  })

  it('botón "Guardar" está deshabilitado durante isPending de mutación', () => {
    vi.mocked(useAgentConfig).mockReturnValue({
      config: MOCK_CONFIG,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })
    vi.mocked(useUpdatePrompt).mockReturnValue({
      ...MOCK_MUTATION_IDLE,
      isPending: true,
    } as unknown as ReturnType<typeof useUpdatePrompt>)

    render(<AgentPromptEditor />)

    const submitBtn = screen.getByRole('button', { name: /guardando/i })
    expect(submitBtn).toBeDisabled()
  })

  it('submit llama a mutation.mutate con los valores del formulario', async () => {
    vi.mocked(useAgentConfig).mockReturnValue({
      config: MOCK_CONFIG,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(<AgentPromptEditor />)

    // El formulario ya tiene el valor del config cargado
    const submitBtn = screen.getByRole('button', { name: /guardar/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          system_prompt_override: MOCK_CONFIG.system_prompt_override,
        })
      )
    })
  })
})
