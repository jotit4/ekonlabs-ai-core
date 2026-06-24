import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock useAgentContext
const mockUseAgentContext = vi.fn()
vi.mock('@/hooks/use-agent-context', () => ({
  useAgentContext: (phone: string) => mockUseAgentContext(phone),
}))

import { PatientContextPanel } from './PatientContextPanel'

describe('PatientContextPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('muestra skeletons cuando isLoading es true', () => {
    mockUseAgentContext.mockReturnValue({ context: null, isLoading: true, isError: false })

    const { container } = render(
      <PatientContextPanel phone="+5491111111111" />
    )

    // El panel aside debe existir con complementary
    const aside = screen.getByRole('complementary')
    expect(aside).toBeInTheDocument()

    // Los skeletons son divs con animate-pulse
    const skeletons = container.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThanOrEqual(5)
  })

  it('muestra "No se pudo cargar el contexto" cuando isError es true', () => {
    mockUseAgentContext.mockReturnValue({ context: null, isLoading: false, isError: true })

    render(<PatientContextPanel phone="+5491111111111" />)

    expect(screen.getByText('No se pudo cargar el contexto')).toBeInTheDocument()
  })

  it('distingue "sin datos aún" (context null sin error) de un error de carga', () => {
    mockUseAgentContext.mockReturnValue({ context: null, isLoading: false, isError: false })

    render(<PatientContextPanel phone="+5491111111111" />)

    // No es un error de carga: el agente simplemente todavía no capturó nada.
    expect(
      screen.getByText('El agente aún no capturó datos de esta conversación')
    ).toBeInTheDocument()
    expect(screen.queryByText('No se pudo cargar el contexto')).not.toBeInTheDocument()
  })

  it('muestra nombre del paciente cuando hay datos', () => {
    mockUseAgentContext.mockReturnValue({
      context: {
        patient_name: 'Juan Pérez',
        phone_number: '+5491111111111',
        detected_intent: 'agendar_turno',
        dni: null,
        service_requested: null,
        slot_requested: null,
        availability_info: null,
        obra_social: null,
        current_block: null,
        is_resolved: false,
      },
      isLoading: false,
      isError: false,
    })

    render(<PatientContextPanel phone="+5491111111111" />)

    expect(screen.getByText('Juan Pérez')).toBeInTheDocument()
  })

  it('muestra "Sin datos aún" para campos null como DNI (dato no capturado, no error)', () => {
    mockUseAgentContext.mockReturnValue({
      context: {
        patient_name: 'Ana López',
        phone_number: null,
        detected_intent: null,
        dni: null,
        service_requested: null,
        slot_requested: null,
        availability_info: null,
        obra_social: null,
        current_block: null,
      },
      isLoading: false,
      isError: false,
    })

    render(<PatientContextPanel phone="+5491111111111" />)

    // Múltiples "Sin datos aún" para los campos que el agente todavía no capturó.
    const sinDatosEls = screen.getAllByText('Sin datos aún')
    expect(sinDatosEls.length).toBeGreaterThan(0)
  })

  it('muestra badge "Conversación resuelta" cuando status es resolved', () => {
    mockUseAgentContext.mockReturnValue({
      context: {
        patient_name: 'María García',
        detected_intent: 'agendar_turno',
      },
      isLoading: false,
      isError: false,
    })

    render(<PatientContextPanel phone="+5491111111111" conversationStatus="resolved" />)

    expect(screen.getByText('Conversación resuelta')).toBeInTheDocument()
  })

  it('muestra badge "En control humano" cuando status es human_takeover', () => {
    mockUseAgentContext.mockReturnValue({
      context: {
        patient_name: 'Carlos Ruiz',
        detected_intent: null,
      },
      isLoading: false,
      isError: false,
    })

    render(<PatientContextPanel phone="+5491111111111" conversationStatus="human_takeover" />)

    expect(screen.getByText('En control humano')).toBeInTheDocument()
  })

  it('sección "Bloqueo actual" no se renderiza cuando current_block es null', () => {
    mockUseAgentContext.mockReturnValue({
      context: {
        patient_name: 'Laura Vega',
        detected_intent: 'agendar_turno',
        current_block: null,
      },
      isLoading: false,
      isError: false,
    })

    render(<PatientContextPanel phone="+5491111111111" />)

    // "Bloqueo actual" label no debe aparecer cuando current_block es null
    expect(screen.queryByLabelText('Bloqueo actual')).not.toBeInTheDocument()
  })

  it('tiene role="complementary" y aria-label="Contexto de la conversación"', () => {
    mockUseAgentContext.mockReturnValue({
      context: null,
      isLoading: false,
      isError: false,
    })

    render(<PatientContextPanel phone="+5491111111111" />)

    const aside = screen.getByRole('complementary', { name: 'Contexto de la conversación' })
    expect(aside).toBeInTheDocument()
  })
})
