import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock useTakeover
const mockTakeover = vi.fn()
const mockUseTakeover = vi.fn()

vi.mock('@/hooks/use-takeover', () => ({
  useTakeover: () => mockUseTakeover(),
}))

// Mock useSendMessage
const mockSendMessage = vi.fn()
const mockResetSend = vi.fn()
const mockUseSendMessage = vi.fn()

vi.mock('@/hooks/use-send-message', () => ({
  useSendMessage: () => mockUseSendMessage(),
}))

// Mock useRelease
const mockRelease = vi.fn()
const mockUseRelease = vi.fn()

vi.mock('@/hooks/use-release', () => ({
  useRelease: () => mockUseRelease(),
}))

import { TakeoverBar } from './TakeoverBar'

describe('TakeoverBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: no pending takeover
    mockUseTakeover.mockReturnValue({ takeover: mockTakeover, isPending: false })
    // Default: no pending send, no error
    mockUseSendMessage.mockReturnValue({
      sendMessage: mockSendMessage,
      isPending: false,
      isError: false,
      reset: mockResetSend,
    })
    // Default: no pending release
    mockUseRelease.mockReturnValue({ release: mockRelease, isPending: false })
  })

  it('muestra "Asumir control" cuando status es ai_active', () => {
    render(
      <TakeoverBar
        phone="+5491111111111"
        conversationStatus="ai_active"
        confidenceLevel="medium"
      />
    )
    expect(screen.getByText('Asumir control')).toBeInTheDocument()
  })

  it('muestra estado del agente con confidence level "high" → "Activo"', () => {
    render(
      <TakeoverBar
        phone="+5491111111111"
        conversationStatus="ai_active"
        confidenceLevel="high"
      />
    )
    expect(screen.getByText('Agente IA · Activo')).toBeInTheDocument()
  })

  it('muestra estado del agente con confidence level "medium" → "Confianza media"', () => {
    render(
      <TakeoverBar
        phone="+5491111111111"
        conversationStatus="ai_active"
        confidenceLevel="medium"
      />
    )
    expect(screen.getByText('Agente IA · Confianza media')).toBeInTheDocument()
  })

  it('muestra estado del agente con confidence level "low" → "Necesita ayuda"', () => {
    render(
      <TakeoverBar
        phone="+5491111111111"
        conversationStatus="needs_intervention"
        confidenceLevel="low"
      />
    )
    expect(screen.getByText('Agente IA · Necesita ayuda')).toBeInTheDocument()
  })

  it('botón "Asumir control" llama a takeover(phone) al hacer click', () => {
    render(
      <TakeoverBar
        phone="+5491111111111"
        conversationStatus="ai_active"
        confidenceLevel="medium"
      />
    )
    const button = screen.getByLabelText('Asumir control de la conversación')
    fireEvent.click(button)
    expect(mockTakeover).toHaveBeenCalledWith('+5491111111111')
  })

  it('botón "Asumir control" está deshabilitado cuando isPending es true', () => {
    mockUseTakeover.mockReturnValue({ takeover: mockTakeover, isPending: true })

    render(
      <TakeoverBar
        phone="+5491111111111"
        conversationStatus="ai_active"
        confidenceLevel="medium"
      />
    )
    const button = screen.getByLabelText('Asumir control de la conversación')
    expect(button).toBeDisabled()
    expect(screen.getByText('Asumiendo control...')).toBeInTheDocument()
  })

  it('muestra nombre del usuario en control cuando status es human_takeover', () => {
    render(
      <TakeoverBar
        phone="+5491111111111"
        conversationStatus="human_takeover"
        currentUserName="Valentina"
      />
    )
    expect(screen.getByText('Valentina · En control')).toBeInTheDocument()
  })

  // ─── Quién tomó el control (P1.b) ────────────────────────────────────────────

  it('controlledBy tiene prioridad sobre currentUserName en el label', () => {
    render(
      <TakeoverBar
        phone="+5491111111111"
        conversationStatus="human_takeover"
        controlledBy="Carla"
        currentUserName="Valentina"
      />
    )
    expect(screen.getByText('Carla · En control')).toBeInTheDocument()
    expect(screen.queryByText('Valentina · En control')).not.toBeInTheDocument()
  })

  it('cae a currentUserName cuando no hay controlledBy', () => {
    render(
      <TakeoverBar
        phone="+5491111111111"
        conversationStatus="human_takeover"
        currentUserName="Valentina"
      />
    )
    expect(screen.getByText('Valentina · En control')).toBeInTheDocument()
  })

  it('cae a "Operador" cuando no hay controlledBy ni currentUserName', () => {
    render(
      <TakeoverBar
        phone="+5491111111111"
        conversationStatus="human_takeover"
      />
    )
    expect(screen.getByText('Operador · En control')).toBeInTheDocument()
  })

  it('muestra ghost button "Liberar al agente" cuando status es human_takeover', () => {
    render(
      <TakeoverBar
        phone="+5491111111111"
        conversationStatus="human_takeover"
      />
    )
    expect(screen.getByLabelText('Liberar al agente')).toBeInTheDocument()
    expect(screen.getByLabelText('Liberar al agente')).not.toBeDisabled()
  })

  it('compose area existe cuando status es human_takeover', () => {
    render(
      <TakeoverBar
        phone="+5491111111111"
        conversationStatus="human_takeover"
      />
    )
    expect(screen.getByLabelText('Escribí tu mensaje')).toBeInTheDocument()
  })

  it('muestra "Conversación resuelta" cuando status es resolved', () => {
    render(
      <TakeoverBar
        phone="+5491111111111"
        conversationStatus="resolved"
      />
    )
    expect(screen.getByText('Conversación resuelta')).toBeInTheDocument()
  })

  it('aria-live="polite" presente en el contenedor de estado', () => {
    const { container } = render(
      <TakeoverBar
        phone="+5491111111111"
        conversationStatus="ai_active"
        confidenceLevel="medium"
      />
    )
    const el = container.querySelector('[aria-live="polite"]')
    expect(el).toBeInTheDocument()
  })

  // ─── Nuevos tests de Story 4.6 ───────────────────────────────────────────────

  it('textarea está habilitado cuando conversationStatus === "human_takeover"', () => {
    render(
      <TakeoverBar
        phone="+5491111111111"
        conversationStatus="human_takeover"
      />
    )
    const textarea = screen.getByLabelText('Escribí tu mensaje')
    expect(textarea).not.toBeDisabled()
  })

  it('textarea está deshabilitado cuando conversationStatus === "ai_active"', () => {
    // En ai_active no se renderiza el textarea — se muestra el botón "Asumir control"
    render(
      <TakeoverBar
        phone="+5491111111111"
        conversationStatus="ai_active"
      />
    )
    expect(screen.queryByLabelText('Escribí tu mensaje')).not.toBeInTheDocument()
  })

  it('botón "Enviar" está deshabilitado cuando el textarea está vacío', () => {
    render(
      <TakeoverBar
        phone="+5491111111111"
        conversationStatus="human_takeover"
      />
    )
    const sendButton = screen.getByLabelText('Enviar mensaje')
    expect(sendButton).toBeDisabled()
  })

  it('botón "Enviar" se habilita cuando hay texto en el textarea', () => {
    render(
      <TakeoverBar
        phone="+5491111111111"
        conversationStatus="human_takeover"
      />
    )
    const textarea = screen.getByLabelText('Escribí tu mensaje')
    fireEvent.change(textarea, { target: { value: 'Hola paciente' } })

    const sendButton = screen.getByLabelText('Enviar mensaje')
    expect(sendButton).not.toBeDisabled()
  })

  it('botón "Enviar" llama a sendMessage al hacer click', () => {
    render(
      <TakeoverBar
        phone="+5491111111111"
        conversationStatus="human_takeover"
      />
    )
    const textarea = screen.getByLabelText('Escribí tu mensaje')
    fireEvent.change(textarea, { target: { value: 'Hola paciente' } })

    const sendButton = screen.getByLabelText('Enviar mensaje')
    fireEvent.click(sendButton)

    expect(mockSendMessage).toHaveBeenCalledWith('Hola paciente')
  })

  it('se muestra error inline cuando isError === true (texto "Error al enviar")', () => {
    mockUseSendMessage.mockReturnValue({
      sendMessage: mockSendMessage,
      isPending: false,
      isError: true,
      reset: mockResetSend,
    })

    render(
      <TakeoverBar
        phone="+5491111111111"
        conversationStatus="human_takeover"
      />
    )
    expect(screen.getByText('Error al enviar. El mensaje no se perdió.')).toBeInTheDocument()
    expect(screen.getByText('Reintentar')).toBeInTheDocument()
  })

  it('Ctrl+Enter dispara el envío cuando hay texto', () => {
    render(
      <TakeoverBar
        phone="+5491111111111"
        conversationStatus="human_takeover"
      />
    )
    const textarea = screen.getByLabelText('Escribí tu mensaje')
    fireEvent.change(textarea, { target: { value: 'Mensaje rápido' } })
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })

    expect(mockSendMessage).toHaveBeenCalledWith('Mensaje rápido')
  })

  it('isPendingSend: true deshabilita textarea y botón "Enviar"', () => {
    mockUseSendMessage.mockReturnValue({
      sendMessage: mockSendMessage,
      isPending: true,
      isError: false,
      reset: mockResetSend,
    })

    render(
      <TakeoverBar
        phone="+5491111111111"
        conversationStatus="human_takeover"
      />
    )
    const textarea = screen.getByLabelText('Escribí tu mensaje')
    const sendButton = screen.getByLabelText('Enviar mensaje')

    expect(textarea).toBeDisabled()
    expect(sendButton).toBeDisabled()
  })

  it('el textarea recupera el foco después de hacer click en Enviar', () => {
    render(
      <TakeoverBar
        phone="+5491111111111"
        conversationStatus="human_takeover"
      />
    )
    const textarea = screen.getByLabelText('Escribí tu mensaje')
    fireEvent.change(textarea, { target: { value: 'Hola paciente' } })

    const sendButton = screen.getByLabelText('Enviar mensaje')
    fireEvent.click(sendButton)

    expect(document.activeElement).toBe(textarea)
  })

  // ─── Nuevos tests de Story 4.7 ───────────────────────────────────────────────

  it('ghost button "Liberar al agente" está HABILITADO cuando status es human_takeover', () => {
    render(
      <TakeoverBar
        phone="+5491111111111"
        conversationStatus="human_takeover"
      />
    )
    const button = screen.getByLabelText('Liberar al agente')
    expect(button).not.toBeDisabled()
  })

  it('ghost button "Liberar al agente" llama a release() al hacer click', () => {
    render(
      <TakeoverBar
        phone="+5491111111111"
        conversationStatus="human_takeover"
      />
    )
    const button = screen.getByLabelText('Liberar al agente')
    fireEvent.click(button)
    expect(mockRelease).toHaveBeenCalledTimes(1)
  })

  it('ghost button muestra "Liberando..." cuando isPendingRelease es true', () => {
    mockUseRelease.mockReturnValue({ release: mockRelease, isPending: true })
    render(
      <TakeoverBar
        phone="+5491111111111"
        conversationStatus="human_takeover"
      />
    )
    expect(screen.getByText('Liberando...')).toBeInTheDocument()
  })

  it('ghost button está deshabilitado cuando isPendingRelease es true', () => {
    mockUseRelease.mockReturnValue({ release: mockRelease, isPending: true })
    render(
      <TakeoverBar
        phone="+5491111111111"
        conversationStatus="human_takeover"
      />
    )
    expect(screen.getByLabelText('Liberar al agente')).toBeDisabled()
  })

  // ─── Tests de adjuntos (Track A — A3) ────────────────────────────────────────

  it('muestra el botón de adjuntar cuando status es human_takeover', () => {
    render(
      <TakeoverBar
        phone="+5491111111111"
        conversationStatus="human_takeover"
      />
    )
    // El botón (visible) tiene aria-label "Adjuntar archivo"; el input oculto tiene "Seleccionar archivo adjunto"
    expect(screen.getByRole('button', { name: 'Adjuntar archivo' })).toBeInTheDocument()
  })

  it('NO muestra el botón de adjuntar cuando status es ai_active', () => {
    render(
      <TakeoverBar
        phone="+5491111111111"
        conversationStatus="ai_active"
      />
    )
    // En ai_active no hay compose area
    expect(screen.queryByRole('button', { name: 'Adjuntar archivo' })).not.toBeInTheDocument()
  })

  it('botón "Enviar" está habilitado cuando hay solo un adjunto (sin texto)', () => {
    render(
      <TakeoverBar
        phone="+5491111111111"
        conversationStatus="human_takeover"
      />
    )
    // Simular selección de archivo vía el input oculto (aria-label del input)
    const fileInput = screen.getByLabelText('Seleccionar archivo adjunto') as HTMLInputElement
    const file = new File(['content'], 'imagen.jpg', { type: 'image/jpeg' })
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
    fireEvent.change(fileInput)

    const sendButton = screen.getByLabelText('Enviar mensaje')
    expect(sendButton).not.toBeDisabled()
  })

  it('muestra el nombre del archivo adjunto como preview tras seleccionarlo', () => {
    render(
      <TakeoverBar
        phone="+5491111111111"
        conversationStatus="human_takeover"
      />
    )
    const fileInput = screen.getByLabelText('Seleccionar archivo adjunto') as HTMLInputElement
    const file = new File(['content'], 'documento.pdf', { type: 'application/pdf' })
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
    fireEvent.change(fileInput)

    expect(screen.getByText('documento.pdf')).toBeInTheDocument()
  })

  it('botón "Quitar adjunto" elimina el preview', () => {
    render(
      <TakeoverBar
        phone="+5491111111111"
        conversationStatus="human_takeover"
      />
    )
    const fileInput = screen.getByLabelText('Seleccionar archivo adjunto') as HTMLInputElement
    const file = new File(['content'], 'video.mp4', { type: 'video/mp4' })
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
    fireEvent.change(fileInput)

    expect(screen.getByText('video.mp4')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Quitar adjunto'))
    expect(screen.queryByText('video.mp4')).not.toBeInTheDocument()
  })

  it('muestra error cuando el archivo supera 10 MB', () => {
    render(
      <TakeoverBar
        phone="+5491111111111"
        conversationStatus="human_takeover"
      />
    )
    const fileInput = screen.getByLabelText('Seleccionar archivo adjunto') as HTMLInputElement
    // Crear archivo > 10 MB
    const bigFile = new File(['x'.repeat(1)], 'grande.jpg', { type: 'image/jpeg' })
    Object.defineProperty(bigFile, 'size', { value: 11 * 1024 * 1024 })
    Object.defineProperty(fileInput, 'files', { value: [bigFile], configurable: true })
    fireEvent.change(fileInput)

    expect(screen.getByText('El archivo supera el límite de 10 MB.')).toBeInTheDocument()
    // El preview no debe mostrarse
    expect(screen.queryByText('grande.jpg')).not.toBeInTheDocument()
  })

  it('el botón "Enviar" llama a sendMessage con adjunto cuando hay archivo seleccionado', () => {
    render(
      <TakeoverBar
        phone="+5491111111111"
        conversationStatus="human_takeover"
      />
    )
    const fileInput = screen.getByLabelText('Seleccionar archivo adjunto') as HTMLInputElement
    const file = new File(['content'], 'imagen.jpg', { type: 'image/jpeg' })
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
    fireEvent.change(fileInput)

    // Agregar texto
    const textarea = screen.getByLabelText('Escribí tu mensaje')
    fireEvent.change(textarea, { target: { value: 'Mirá esta imagen' } })

    fireEvent.click(screen.getByLabelText('Enviar mensaje'))

    expect(mockSendMessage).toHaveBeenCalledWith('Mirá esta imagen', [file])
  })
})
