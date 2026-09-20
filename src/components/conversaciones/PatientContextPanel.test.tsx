import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock useAgentContext
const mockUseAgentContext = vi.fn()
vi.mock('@/hooks/use-agent-context', () => ({
  useAgentContext: (phone: string) => mockUseAgentContext(phone),
}))

// Mock Supabase Browser Client
vi.mock('@/lib/supabase/client', () => {
  const mockSupabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: { patient_id: 'patient-1' }, error: null })
        })
      })
    })
  }
  return {
    createSupabaseBrowserClient: () => mockSupabase,
  }
})

import { PatientContextPanel, isDateOnlySlot } from './PatientContextPanel'

describe('isDateOnlySlot (decide si se convierte a hora de Argentina)', () => {
  // Esta decisión NO puede testearse por la salida: en una máquina configurada
  // en Argentina, convertir o no convertir una fecha sola da el mismo texto.
  it('trata una fecha sola como fecha sola (no se le aplica zona horaria)', () => {
    expect(isDateOnlySlot('2026-07-29')).toBe(true)
  })

  it('trata un instante con hora como instante (sí se convierte)', () => {
    expect(isDateOnlySlot('2026-07-29T12:00:00+00:00')).toBe(false)
    expect(isDateOnlySlot('2026-07-29T12:00:00Z')).toBe(false)
  })

  it('no trata como fecha un texto libre del paciente', () => {
    expect(isDateOnlySlot('mañana a la tarde')).toBe(false)
    expect(isDateOnlySlot('')).toBe(false)
  })
})

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

  // ── Hallazgo 8: "Horario solicitado" en horario de Argentina, no ISO/UTC crudo ──

  it('formatea slot_requested (instante ISO en UTC) a horario de Argentina, no crudo', () => {
    mockUseAgentContext.mockReturnValue({
      context: {
        patient_name: 'Juan Pérez',
        detected_intent: 'agendar_turno',
        slot_requested: '2026-07-29T12:00:00+00:00',
        availability_info: null,
      },
      isLoading: false,
      isError: false,
    })

    render(<PatientContextPanel phone="+5491111111111" />)

    // 12:00 UTC = 09:00 en Argentina (UTC-3) — nunca se muestra el ISO crudo
    // ni la hora sin convertir.
    expect(screen.queryByText('2026-07-29T12:00:00+00:00')).not.toBeInTheDocument()
    expect(screen.queryByText(/12:00/)).not.toBeInTheDocument()
    expect(screen.getByText(/09:00/)).toBeInTheDocument()
    expect(screen.getByText(/29\/07/)).toBeInTheDocument()
  })

  it('usa availability_info (texto libre) cuando no hay slot_requested', () => {
    mockUseAgentContext.mockReturnValue({
      context: {
        patient_name: 'Juan Pérez',
        detected_intent: 'agendar_turno',
        slot_requested: null,
        availability_info: 'Prefiere por la mañana',
      },
      isLoading: false,
      isError: false,
    })

    render(<PatientContextPanel phone="+5491111111111" />)

    expect(screen.getByText('Prefiere por la mañana')).toBeInTheDocument()
  })

  it('formatea una fecha sola (sin hora) sin correr el día por zona horaria', () => {
    mockUseAgentContext.mockReturnValue({
      context: {
        patient_name: 'Juan Pérez',
        detected_intent: 'agendar_turno',
        slot_requested: '2026-07-29',
        availability_info: null,
      },
      isLoading: false,
      isError: false,
    })

    render(<PatientContextPanel phone="+5491111111111" />)

    expect(screen.getByText(/29\/07/)).toBeInTheDocument()
    expect(screen.queryByText('2026-07-29')).not.toBeInTheDocument()
  })

  it('usa los rótulos en castellano llano "Qué quiere hacer" y "Horario solicitado"', () => {
    mockUseAgentContext.mockReturnValue({
      context: {
        patient_name: 'Juan Pérez',
        detected_intent: 'Sacar un turno',
        slot_requested: null,
        availability_info: null,
      },
      isLoading: false,
      isError: false,
    })

    render(<PatientContextPanel phone="+5491111111111" />)

    expect(screen.getByLabelText('Qué quiere hacer')).toBeInTheDocument()
    expect(screen.getByLabelText('Horario solicitado')).toBeInTheDocument()
    expect(screen.queryByLabelText('Intención detectada')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Slot / Disponibilidad')).not.toBeInTheDocument()
  })
})
