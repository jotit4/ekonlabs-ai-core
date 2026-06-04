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

vi.mock('@/hooks/use-update-agent-config', () => ({
  useUpdateAgentConfig: vi.fn(),
}))

import { useAgentConfig } from '@/hooks/use-agent-config'
import { useUpdateAgentConfig } from '@/hooks/use-update-agent-config'
import { AgentPromptEditor } from './AgentPromptEditor'
import type { ClinicAgentConfig } from '@/types/agente'

// ── Datos de prueba ────────────────────────────────────────────────────────────

const MOCK_CONFIG: ClinicAgentConfig = {
  org_id: '5298fcc5-15bf-494c-9655-b49d759cfef4',
  clinic_name: 'ISADI',
  agent_name: 'Asistente de prueba',
  prompt_rules: 'No agendar feriados',
  ia_config: {
    tone_base: 'informal',
    tone_length: 2,
    identity: 'Soy el asistente',
    constraints: 'No dar diagnósticos',
    features: {
      enable_new_appointment: true,
      enable_cancel: true,
      require_dni: false,
      require_obra_social: false,
    },
  },
  operations_config: { min_notice_hours: 2, future_window_days: 30 },
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
    vi.mocked(useUpdateAgentConfig).mockReturnValue(
      MOCK_MUTATION_IDLE as unknown as ReturnType<typeof useUpdateAgentConfig>
    )
  })

  function mockConfigLoaded(config: ClinicAgentConfig = MOCK_CONFIG) {
    vi.mocked(useAgentConfig).mockReturnValue({
      config,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })
  }

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

  it('renderiza todos los campos editables', () => {
    mockConfigLoaded()
    render(<AgentPromptEditor />)

    expect(screen.getByLabelText(/nombre del agente/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/identidad/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/restricciones/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/tono base/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/extensión de respuestas/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/agendar turnos nuevos/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/cancelar turnos/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/requerir dni/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/requerir obra social/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/anticipación mínima/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/ventana futura/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/reglas en lenguaje natural/i)).toBeInTheDocument()
  })

  it('puebla los campos con los valores del config cargado', () => {
    mockConfigLoaded()
    render(<AgentPromptEditor />)

    expect(screen.getByLabelText(/nombre del agente/i)).toHaveValue('Asistente de prueba')
    expect(screen.getByLabelText(/identidad/i)).toHaveValue('Soy el asistente')
    expect(screen.getByLabelText(/reglas en lenguaje natural/i)).toHaveValue('No agendar feriados')
    expect((screen.getByLabelText(/agendar turnos nuevos/i) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText(/requerir dni/i) as HTMLInputElement).checked).toBe(false)
  })

  it('muestra preview "Sistema base" read-only y "Reglas de la Clínica"', () => {
    mockConfigLoaded()
    render(<AgentPromptEditor />)

    expect(screen.getByText('Sistema base')).toBeInTheDocument()
    expect(
      screen.getByText('El prompt base está gestionado en el backend de IA y no es editable desde el dashboard.')
    ).toBeInTheDocument()
    // "Reglas de la Clínica" aparece como legend del fieldset y como título del preview
    expect(screen.getAllByText('Reglas de la Clínica').length).toBeGreaterThanOrEqual(1)
  })

  it('ya NO muestra "Override personalizado" ni "Reglas del tenant" (deprecados)', () => {
    mockConfigLoaded()
    render(<AgentPromptEditor />)

    expect(screen.queryByText('Override personalizado')).not.toBeInTheDocument()
    expect(screen.queryByText('Reglas del tenant')).not.toBeInTheDocument()
  })

  it('el preview de "Reglas de la Clínica" se actualiza al escribir (watch)', async () => {
    mockConfigLoaded({ ...MOCK_CONFIG, prompt_rules: '' })
    render(<AgentPromptEditor />)

    const textarea = screen.getByLabelText(/reglas en lenguaje natural/i)
    await userEvent.clear(textarea)
    await userEvent.type(textarea, 'Nueva regla en vivo')

    await waitFor(() => {
      expect(screen.getByText('Nueva regla en vivo')).toBeInTheDocument()
    })
  })

  it('submit llama a mutation.mutate con el payload parcial del form', async () => {
    mockConfigLoaded()
    render(<AgentPromptEditor />)

    const submitBtn = screen.getByRole('button', { name: /guardar/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_name: 'Asistente de prueba',
          prompt_rules: 'No agendar feriados',
          ia_config: expect.objectContaining({ tone_base: 'informal' }),
          operations_config: expect.objectContaining({ min_notice_hours: 2 }),
        })
      )
    })
  })

  it('muestra error inline cuando prompt_rules supera longitud máxima', async () => {
    mockConfigLoaded()
    render(<AgentPromptEditor />)

    const textarea = screen.getByLabelText(/reglas en lenguaje natural/i)
    fireEvent.change(textarea, { target: { value: 'a'.repeat(10001) } })

    const submitBtn = screen.getByRole('button', { name: /guardar/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText(/10.000 caracteres/i)).toBeInTheDocument()
    })
    expect(mockMutate).not.toHaveBeenCalled()
  })

  it('botón "Guardar" está deshabilitado durante isPending de mutación', () => {
    mockConfigLoaded()
    vi.mocked(useUpdateAgentConfig).mockReturnValue({
      ...MOCK_MUTATION_IDLE,
      isPending: true,
    } as unknown as ReturnType<typeof useUpdateAgentConfig>)

    render(<AgentPromptEditor />)

    const submitBtn = screen.getByRole('button', { name: /guardando/i })
    expect(submitBtn).toBeDisabled()
  })
})
