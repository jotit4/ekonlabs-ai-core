import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { KBProposalResponse } from '@/types/agente'

const {
  mockUseProposeCorrection,
  mockUseReindexTopic,
} = vi.hoisted(() => ({
  mockUseProposeCorrection: vi.fn(),
  mockUseReindexTopic: vi.fn(),
}))

vi.mock('@/hooks/use-knowledge-propose', () => ({
  useProposeCorrection: mockUseProposeCorrection,
}))
vi.mock('@/hooks/use-knowledge-topics', () => ({
  useReindexTopic: mockUseReindexTopic,
}))

import { CorreccionAgenteModal } from './CorreccionAgenteModal'

const PROPOSAL: KBProposalResponse = {
  suggested_topic: 'obras-sociales',
  is_new_topic: false,
  current_text: 'No atendemos OSEP.',
  proposed_text: 'Sí, atendemos OSEP con autorización previa.',
  gap_questions: [],
  contradiction_warning: null,
}

let proposeMutate: ReturnType<typeof vi.fn>
let reindexMutate: ReturnType<typeof vi.fn>

function setupMocks(opts: {
  proposePending?: boolean
  proposeError?: boolean
  reindexPending?: boolean
  reindexError?: boolean
} = {}) {
  proposeMutate = vi.fn()
  reindexMutate = vi.fn()
  mockUseProposeCorrection.mockReturnValue({
    mutate: proposeMutate,
    isPending: opts.proposePending ?? false,
    isError: opts.proposeError ?? false,
  })
  mockUseReindexTopic.mockReturnValue({
    mutate: reindexMutate,
    isPending: opts.reindexPending ?? false,
    isError: opts.reindexError ?? false,
  })
}

/** Lleva el modal al paso "confirmar" resolviendo el propose con `proposal`. */
function advanceToConfirm(proposal: KBProposalResponse = PROPOSAL) {
  proposeMutate.mockImplementation((_payload, opts) => opts?.onSuccess?.(proposal))
  fireEvent.change(
    screen.getByRole('textbox', { name: /Qué corregimos/ }),
    { target: { value: 'Sí atendemos OSEP' } },
  )
  fireEvent.click(screen.getByRole('button', { name: 'Revisar' }))
}

describe('CorreccionAgenteModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupMocks()
  })

  it('precarga el contexto read-only: pregunta del paciente y respuesta del agente', () => {
    render(
      <CorreccionAgenteModal
        agentMessageContent="No, no atendemos esa obra social."
        patientQuestion="¿Atienden OSEP?"
        onClose={() => {}}
      />,
    )
    expect(screen.getByTestId('correccion-patient-question')).toHaveTextContent(
      '¿Atienden OSEP?',
    )
    expect(screen.getByTestId('correccion-agent-answer')).toHaveTextContent(
      'No, no atendemos esa obra social.',
    )
  })

  it('muestra placeholder cuando no hay pregunta previa del paciente', () => {
    render(
      <CorreccionAgenteModal
        agentMessageContent="Respuesta"
        patientQuestion={null}
        onClose={() => {}}
      />,
    )
    expect(screen.getByTestId('correccion-patient-question')).toHaveTextContent(
      'Sin mensaje previo del paciente',
    )
  })

  it('limpia el prefijo [audio_transcription]: en la referencia', () => {
    render(
      <CorreccionAgenteModal
        agentMessageContent="Respuesta"
        patientQuestion="[audio_transcription]: Quiero un turno"
        onClose={() => {}}
      />,
    )
    expect(screen.getByTestId('correccion-patient-question')).toHaveTextContent(
      'Quiero un turno',
    )
    expect(screen.getByTestId('correccion-patient-question')).not.toHaveTextContent(
      '[audio_transcription]:',
    )
  })

  it('es un dialog accesible', () => {
    render(
      <CorreccionAgenteModal
        agentMessageContent="Respuesta"
        patientQuestion={null}
        onClose={() => {}}
      />,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby', 'correccion-modal-title')
  })

  // ── Paso 1: capturar ───────────────────────────────────────────────────

  it('no propone si la nota está vacía y muestra error de validación', async () => {
    render(
      <CorreccionAgenteModal
        agentMessageContent="Respuesta"
        patientQuestion="¿Atienden OSEP?"
        onClose={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }))
    await waitFor(() => {
      expect(
        screen.getByText('La nota de corrección es obligatoria'),
      ).toBeInTheDocument()
    })
    expect(proposeMutate).not.toHaveBeenCalled()
  })

  it('"Revisar" llama a propose con patient_question, wrong_answer y correction_note', async () => {
    render(
      <CorreccionAgenteModal
        agentMessageContent="No, no atendemos OSEP."
        patientQuestion="¿Atienden OSEP?"
        onClose={() => {}}
      />,
    )
    fireEvent.change(screen.getByRole('textbox', { name: /Qué corregimos/ }), {
      target: { value: 'Sí, con autorización previa.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }))

    await waitFor(() => expect(proposeMutate).toHaveBeenCalledTimes(1))
    expect(proposeMutate.mock.calls[0][0]).toEqual({
      patient_question: '¿Atienden OSEP?',
      wrong_answer: 'No, no atendemos OSEP.',
      correction_note: 'Sí, con autorización previa.',
    })
  })

  it('muestra "Analizando..." y deshabilita el botón mientras propose está pending', () => {
    setupMocks({ proposePending: true })
    render(
      <CorreccionAgenteModal
        agentMessageContent="Resp"
        patientQuestion={null}
        onClose={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: 'Analizando...' })).toBeDisabled()
  })

  it('muestra error si propose falla y permite reintentar', () => {
    setupMocks({ proposeError: true })
    render(
      <CorreccionAgenteModal
        agentMessageContent="Resp"
        patientQuestion={null}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText(/No pudimos generar la propuesta/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Revisar' })).not.toBeDisabled()
  })

  it('Cancelar en paso 1 llama onClose', () => {
    const onClose = vi.fn()
    render(
      <CorreccionAgenteModal
        agentMessageContent="Resp"
        patientQuestion={null}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // ── Paso 2: confirmar ──────────────────────────────────────────────────

  it('al recibir la propuesta pasa al paso 2 con antes/después prellenados', async () => {
    render(
      <CorreccionAgenteModal
        agentMessageContent="No, no atendemos OSEP."
        patientQuestion="¿Atienden OSEP?"
        onClose={() => {}}
      />,
    )
    advanceToConfirm()
    await waitFor(() => {
      expect(screen.getByTestId('correccion-current-text')).toHaveTextContent(
        'No atendemos OSEP.',
      )
    })
    const proposed = screen.getByRole('textbox', {
      name: /Texto propuesto/,
    }) as HTMLTextAreaElement
    expect(proposed.value).toBe('Sí, atendemos OSEP con autorización previa.')
    expect((screen.getByRole('textbox', { name: 'Tema' }) as HTMLInputElement).value).toBe(
      'obras-sociales',
    )
  })

  it('muestra badge "tema nuevo" y placeholder de texto previo cuando is_new_topic', async () => {
    render(
      <CorreccionAgenteModal
        agentMessageContent="Resp"
        patientQuestion={null}
        onClose={() => {}}
      />,
    )
    advanceToConfirm({
      ...PROPOSAL,
      is_new_topic: true,
      current_text: '',
      suggested_topic: 'nuevo-tema',
    })
    await waitFor(() => {
      expect(screen.getByTestId('correccion-new-topic-badge')).toBeInTheDocument()
    })
    expect(screen.getByTestId('correccion-current-text')).toHaveTextContent(
      '(tema nuevo, sin texto previo)',
    )
  })

  it('muestra gap_questions cuando vienen', async () => {
    render(
      <CorreccionAgenteModal
        agentMessageContent="Resp"
        patientQuestion={null}
        onClose={() => {}}
      />,
    )
    advanceToConfirm({
      ...PROPOSAL,
      gap_questions: ['¿Qué obras sociales?', '¿Desde cuándo?'],
    })
    await waitFor(() => {
      expect(screen.getByTestId('correccion-gap-questions')).toBeInTheDocument()
    })
    expect(screen.getByText('¿Qué obras sociales?')).toBeInTheDocument()
    expect(screen.getByText('¿Desde cuándo?')).toBeInTheDocument()
  })

  it('muestra contradiction_warning cuando viene', async () => {
    render(
      <CorreccionAgenteModal
        agentMessageContent="Resp"
        patientQuestion={null}
        onClose={() => {}}
      />,
    )
    advanceToConfirm({
      ...PROPOSAL,
      contradiction_warning: 'Esto contradice el texto existente sobre OSEP.',
    })
    await waitFor(() => {
      expect(
        screen.getByTestId('correccion-contradiction-warning'),
      ).toHaveTextContent('Esto contradice el texto existente sobre OSEP.')
    })
  })

  it('"Confirmar y guardar" reindexa con el tema y el texto EDITADO', async () => {
    render(
      <CorreccionAgenteModal
        agentMessageContent="Resp"
        patientQuestion={null}
        onClose={() => {}}
      />,
    )
    advanceToConfirm()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Confirmar y guardar' })).toBeInTheDocument()
    })
    // Editar el texto propuesto.
    fireEvent.change(screen.getByRole('textbox', { name: /Texto propuesto/ }), {
      target: { value: 'Texto editado a mano' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y guardar' }))

    await waitFor(() => expect(reindexMutate).toHaveBeenCalledTimes(1))
    expect(reindexMutate.mock.calls[0][0]).toEqual({
      source: 'obras-sociales',
      content: 'Texto editado a mano',
    })
  })

  it('llama onClose en onSuccess del reindex', async () => {
    const onClose = vi.fn()
    reindexMutate.mockImplementation((_payload, opts) => opts?.onSuccess?.())
    render(
      <CorreccionAgenteModal
        agentMessageContent="Resp"
        patientQuestion={null}
        onClose={onClose}
      />,
    )
    advanceToConfirm()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirmar y guardar' })).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y guardar' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('no reindexa si el tema queda vacío y muestra error', async () => {
    render(
      <CorreccionAgenteModal
        agentMessageContent="Resp"
        patientQuestion={null}
        onClose={() => {}}
      />,
    )
    advanceToConfirm()
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Tema' })).toBeInTheDocument(),
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'Tema' }), {
      target: { value: '   ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y guardar' }))
    await waitFor(() =>
      expect(screen.getByText('El tema es obligatorio.')).toBeInTheDocument(),
    )
    expect(reindexMutate).not.toHaveBeenCalled()
  })

  it('muestra "Guardando..." y deshabilita mientras reindex está pending', async () => {
    setupMocks({ reindexPending: true })
    render(
      <CorreccionAgenteModal
        agentMessageContent="Resp"
        patientQuestion={null}
        onClose={() => {}}
      />,
    )
    advanceToConfirm()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Guardando...' })).toBeDisabled()
    })
  })

  it('muestra error si reindex falla', async () => {
    setupMocks({ reindexError: true })
    render(
      <CorreccionAgenteModal
        agentMessageContent="Resp"
        patientQuestion={null}
        onClose={() => {}}
      />,
    )
    advanceToConfirm()
    await waitFor(() => {
      expect(screen.getByText(/No pudimos guardar el tema/)).toBeInTheDocument()
    })
  })

  it('"Volver" regresa al paso 1 conservando el correction_note', async () => {
    render(
      <CorreccionAgenteModal
        agentMessageContent="Resp"
        patientQuestion={null}
        onClose={() => {}}
      />,
    )
    advanceToConfirm()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Volver' })).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }))

    // De vuelta en el paso 1, el textarea conserva la nota.
    const note = screen.getByRole('textbox', {
      name: /Qué corregimos/,
    }) as HTMLTextAreaElement
    expect(note.value).toBe('Sí atendemos OSEP')
    expect(screen.getByRole('button', { name: 'Revisar' })).toBeInTheDocument()
  })
})
