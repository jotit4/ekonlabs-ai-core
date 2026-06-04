import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { CorreccionAgenteModal } from './CorreccionAgenteModal'

// Mock del hook de mutación (reuso 6.7) — no queremos pegarle al endpoint real
const mutateMock = vi.fn()
let isPending = false

vi.mock('@/hooks/use-knowledge-mutations', () => ({
  useCreateKnowledge: () => ({
    mutate: mutateMock,
    isPending,
  }),
}))

beforeEach(() => {
  mutateMock.mockReset()
  isPending = false
})

describe('CorreccionAgenteModal', () => {
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

  it('precarga "Tema" con "correcciones"', () => {
    render(
      <CorreccionAgenteModal
        agentMessageContent="Respuesta"
        patientQuestion={null}
        onClose={() => {}}
      />,
    )
    expect(screen.getByLabelText(/Tema/)).toHaveValue('correcciones')
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

  it('no muta si la respuesta está vacía y muestra error', async () => {
    render(
      <CorreccionAgenteModal
        agentMessageContent="Respuesta"
        patientQuestion="¿Atienden OSEP?"
        onClose={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => {
      expect(screen.getByText('La respuesta es obligatoria')).toBeInTheDocument()
    })
    expect(mutateMock).not.toHaveBeenCalled()
  })

  it('guardar válido llama a mutate con content compuesto y source_filename', async () => {
    render(
      <CorreccionAgenteModal
        agentMessageContent="No, no atendemos OSEP."
        patientQuestion="¿Atienden OSEP?"
        onClose={() => {}}
      />,
    )
    fireEvent.change(screen.getByRole('textbox', { name: /Qué debería haber respondido/ }), {
      target: { value: 'Sí, con autorización previa.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => {
      expect(mutateMock).toHaveBeenCalledTimes(1)
    })
    const [payload] = mutateMock.mock.calls[0]
    expect(payload).toEqual({
      content:
        'Consulta del paciente: "¿Atienden OSEP?"\nRespuesta correcta: Sí, con autorización previa.',
      source_filename: 'correcciones',
    })
  })

  it('llama onClose en onSuccess de la mutación', async () => {
    const onClose = vi.fn()
    mutateMock.mockImplementation((_payload, opts) => opts?.onSuccess?.())
    render(
      <CorreccionAgenteModal
        agentMessageContent="Resp"
        patientQuestion={null}
        onClose={onClose}
      />,
    )
    fireEvent.change(screen.getByRole('textbox', { name: /Qué debería haber respondido/ }), {
      target: { value: 'Respuesta correcta nueva' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('usa el "Tema" sobrescrito cuando el usuario lo cambia', async () => {
    render(
      <CorreccionAgenteModal
        agentMessageContent="Resp"
        patientQuestion={null}
        onClose={() => {}}
      />,
    )
    fireEvent.change(screen.getByRole('textbox', { name: /Qué debería haber respondido/ }), {
      target: { value: 'Una respuesta' },
    })
    fireEvent.change(screen.getByLabelText(/Tema/), {
      target: { value: 'obras-sociales' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => {
      expect(mutateMock).toHaveBeenCalled()
    })
    expect(mutateMock.mock.calls[0][0].source_filename).toBe('obras-sociales')
  })

  it('deshabilita "Guardar" cuando isPending', () => {
    isPending = true
    render(
      <CorreccionAgenteModal
        agentMessageContent="Resp"
        patientQuestion={null}
        onClose={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: 'Guardando...' })).toBeDisabled()
  })

  it('Cancelar llama onClose', () => {
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
})
