import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

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

// KnowledgeBaseManager y ShadowModeToggle se renderizan dentro de
// AgentPromptEditor — se mockean para aislar las pruebas del editor.
vi.mock('@/components/configuracion/KnowledgeBaseManager', () => ({
  KnowledgeBaseManager: ({ canEdit }: { canEdit?: boolean }) => (
    <div data-testid="knowledge-base-manager" data-can-edit={String(canEdit)} />
  ),
}))

vi.mock('@/components/configuracion/ShadowModeToggle', () => ({
  ShadowModeToggle: ({ initialValue }: { initialValue: boolean }) => (
    <div data-testid="shadow-mode-toggle" data-initial-value={String(initialValue)} />
  ),
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
      MOCK_MUTATION_IDLE as unknown as ReturnType<typeof useUpdateAgentConfig>,
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

  // ── Loading / Error ────────────────────────────────────────────────────────

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

  // ── Estructura de tabs ─────────────────────────────────────────────────────

  it('renderiza el tablist con las 4 pestañas', () => {
    mockConfigLoaded()
    render(<AgentPromptEditor />)

    const tablist = screen.getByRole('tablist')
    expect(tablist).toBeInTheDocument()

    expect(screen.getByRole('tab', { name: /personalidad/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /qué puede hacer/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /conocimiento/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /avanzado/i })).toBeInTheDocument()
  })

  it('"Personalidad" está activa por defecto (aria-selected=true)', () => {
    mockConfigLoaded()
    render(<AgentPromptEditor />)

    expect(screen.getByRole('tab', { name: /personalidad/i })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: /qué puede hacer/i })).toHaveAttribute(
      'aria-selected',
      'false',
    )
  })

  it('hace click en pestaña "Qué puede hacer" y cambia la pestaña activa', () => {
    mockConfigLoaded()
    render(<AgentPromptEditor />)

    fireEvent.click(screen.getByRole('tab', { name: /qué puede hacer/i }))

    expect(screen.getByRole('tab', { name: /qué puede hacer/i })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: /personalidad/i })).toHaveAttribute(
      'aria-selected',
      'false',
    )
  })

  it('renderiza el KnowledgeBaseManager en el panel "Conocimiento"', () => {
    mockConfigLoaded()
    render(<AgentPromptEditor />)

    expect(screen.getByTestId('knowledge-base-manager')).toBeInTheDocument()
  })

  it('KnowledgeBaseManager recibe canEdit=true por defecto', () => {
    mockConfigLoaded()
    render(<AgentPromptEditor />)

    expect(screen.getByTestId('knowledge-base-manager')).toHaveAttribute('data-can-edit', 'true')
  })

  it('KnowledgeBaseManager recibe el prop canEdit pasado al editor', () => {
    mockConfigLoaded()
    render(<AgentPromptEditor canEdit={false} />)

    expect(screen.getByTestId('knowledge-base-manager')).toHaveAttribute('data-can-edit', 'false')
  })

  // ── Campos del formulario ──────────────────────────────────────────────────

  it('renderiza todos los campos editables del formulario', () => {
    mockConfigLoaded()
    render(<AgentPromptEditor />)

    // Tab 1: Personalidad
    expect(screen.getByLabelText(/nombre del agente/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/identidad/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/qué debe evitar/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/tono base/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/extensión de respuestas/i)).toBeInTheDocument()

    // Tab 2: Qué puede hacer
    expect(screen.getByLabelText(/agendar turnos nuevos/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/cancelar turnos/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/requerir dni/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/requerir obra social/i)).toBeInTheDocument()

    // Tab 4: Avanzado
    expect(screen.getByLabelText(/anticipación mínima para reservar/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/hasta cuándo se puede reservar/i)).toBeInTheDocument()
  })

  it('NO muestra el texto técnico "## Reglas de la Clínica" en ningún label', () => {
    mockConfigLoaded()
    render(<AgentPromptEditor />)

    expect(
      screen.queryByText(/el agente las inyecta como/i),
    ).not.toBeInTheDocument()
  })

  it('NO muestra la card "Sistema base" técnica', () => {
    mockConfigLoaded()
    render(<AgentPromptEditor />)

    expect(screen.queryByText('Sistema base')).not.toBeInTheDocument()
    expect(
      screen.queryByText(/El prompt base está gestionado en el backend/i),
    ).not.toBeInTheDocument()
  })

  it('ya NO muestra "Shadow Mode" en ningún texto visible', () => {
    mockConfigLoaded()
    render(<AgentPromptEditor isAdmin={true} initialShadowMode={false} />)

    expect(screen.queryByText(/shadow mode/i)).not.toBeInTheDocument()
  })

  it('puebla los campos con los valores del config cargado', () => {
    mockConfigLoaded()
    render(<AgentPromptEditor />)

    expect(screen.getByLabelText(/nombre del agente/i)).toHaveValue('Asistente de prueba')
    expect(screen.getByLabelText(/identidad/i)).toHaveValue('Soy el asistente')
    expect(
      (screen.getByLabelText(/agendar turnos nuevos/i) as HTMLInputElement).checked,
    ).toBe(true)
    expect((screen.getByLabelText(/requerir dni/i) as HTMLInputElement).checked).toBe(false)
  })

  it('ya NO muestra el campo "Reglas de tu clínica" ni su preview (se gestiona en el repo/DB)', () => {
    mockConfigLoaded()
    render(<AgentPromptEditor />)

    expect(screen.queryByLabelText(/reglas de tu clínica/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/así va a usar el agente tus reglas/i)).not.toBeInTheDocument()
  })

  // ── Sección "Confirmación de turnos" (admin) ──────────────────────────────

  it('ShadowModeToggle se renderiza cuando isAdmin=true', () => {
    mockConfigLoaded()
    render(<AgentPromptEditor isAdmin={true} initialShadowMode={false} />)

    expect(screen.getByTestId('shadow-mode-toggle')).toBeInTheDocument()
  })

  it('ShadowModeToggle NO se renderiza cuando isAdmin=false', () => {
    mockConfigLoaded()
    render(<AgentPromptEditor isAdmin={false} />)

    expect(screen.queryByTestId('shadow-mode-toggle')).not.toBeInTheDocument()
  })

  it('ShadowModeToggle recibe initialValue correcto', () => {
    mockConfigLoaded()
    render(<AgentPromptEditor isAdmin={true} initialShadowMode={true} />)

    expect(screen.getByTestId('shadow-mode-toggle')).toHaveAttribute('data-initial-value', 'true')
  })

  // ── Guardado ───────────────────────────────────────────────────────────────

  it('submit llama a mutation.mutate con el payload parcial del form', async () => {
    mockConfigLoaded()
    render(<AgentPromptEditor />)

    const submitBtn = screen.getByRole('button', { name: /guardar/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_name: 'Asistente de prueba',
          ia_config: expect.objectContaining({ tone_base: 'informal' }),
          operations_config: expect.objectContaining({ min_notice_hours: 2 }),
        }),
      )
    })
    // prompt_rules NO se envía desde el dashboard (se gestiona en el repo/DB).
    expect(mockMutate).toHaveBeenCalledWith(
      expect.not.objectContaining({ prompt_rules: expect.anything() }),
    )
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

  // ── Compatibilidad histórica ───────────────────────────────────────────────

  it('ya NO muestra "Override personalizado" ni "Reglas del tenant" (deprecados)', () => {
    mockConfigLoaded()
    render(<AgentPromptEditor />)

    expect(screen.queryByText('Override personalizado')).not.toBeInTheDocument()
    expect(screen.queryByText('Reglas del tenant')).not.toBeInTheDocument()
  })
})
