import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect, beforeAll } from 'vitest'
import { ConversationThread } from './ConversationThread'
import type { ChatwootMessage } from '@/types/conversations'

// Mock date-fns para timestamp predecible
vi.mock('date-fns', () => ({
  format: vi.fn().mockReturnValue('10:30'),
}))
vi.mock('date-fns/locale', () => ({ es: {} }))

// Mock DegradationBanner
vi.mock('@/components/pacientes/DegradationBanner', () => ({
  DegradationBanner: () => <div data-testid="degradation-banner">Chatwoot no disponible</div>,
}))

// jsdom no implementa scrollTo — mockear para evitar errores
beforeAll(() => {
  window.HTMLElement.prototype.scrollTo = vi.fn()
})

const makeMessage = (overrides: Partial<ChatwootMessage> = {}): ChatwootMessage => ({
  id: 1,
  content: 'Mensaje de prueba',
  message_type: 0,
  created_at: 1715000000,
  ...overrides,
})

describe('ConversationThread', () => {
  it('muestra "No hay mensajes" cuando messages es vacío', () => {
    render(<ConversationThread messages={[]} isConnected={true} />)
    expect(screen.getByText('No hay mensajes en esta conversación.')).toBeInTheDocument()
  })

  it('renderiza burbuja de paciente (message_type 0) sin label', () => {
    const msg = makeMessage({ message_type: 0, content: 'Necesito turno' })
    render(<ConversationThread messages={[msg]} isConnected={true} />)
    expect(screen.getByText('Necesito turno')).toBeInTheDocument()
    expect(screen.queryByText('Agente IA')).not.toBeInTheDocument()
  })

  it('renderiza burbuja de Agente IA con label "Agente IA"', () => {
    const msg = makeMessage({
      message_type: 1,
      content: 'Hola, ¿cómo puedo ayudarte?',
      sender: { name: 'bot', type: 'agent_bot' },
    })
    render(<ConversationThread messages={[msg]} isConnected={true} />)
    expect(screen.getByText('Agente IA')).toBeInTheDocument()
    expect(screen.getByText('Hola, ¿cómo puedo ayudarte?')).toBeInTheDocument()
  })

  it('renderiza burbuja de humano con label "[Nombre] · En control"', () => {
    const msg = makeMessage({
      message_type: 1,
      content: 'Hola, te atiende Valentina',
      sender: { name: 'Valentina', type: 'agent' },
      meta: { agent: { name: 'Valentina' } },
    })
    render(<ConversationThread messages={[msg]} isConnected={true} />)
    expect(screen.getByText('Valentina · En control')).toBeInTheDocument()
  })

  it('renderiza separador cuando message_type es 2', () => {
    const msg = makeMessage({
      message_type: 2,
      content: 'Valentina tomó control',
    })
    render(<ConversationThread messages={[msg]} isConnected={true} />)
    expect(screen.getByText('Valentina tomó control')).toBeInTheDocument()
  })

  it('muestra DegradationBanner cuando isConnected es false', () => {
    render(<ConversationThread messages={[]} isConnected={false} />)
    expect(screen.getByTestId('degradation-banner')).toBeInTheDocument()
  })

  it('no muestra DegradationBanner cuando isConnected es true', () => {
    render(<ConversationThread messages={[]} isConnected={true} />)
    expect(screen.queryByTestId('degradation-banner')).not.toBeInTheDocument()
  })

  it('renderiza lista con role="log" y aria-live cuando hay mensajes', () => {
    const msg = makeMessage({ content: 'Test mensaje' })
    render(<ConversationThread messages={[msg]} isConnected={true} />)
    const log = screen.getByRole('log')
    expect(log).toBeInTheDocument()
    expect(log).toHaveAttribute('aria-live', 'polite')
  })

  it('tiene aria-label en el contenedor', () => {
    render(<ConversationThread messages={[]} isConnected={true} />)
    expect(screen.getByLabelText('Hilo de conversación')).toBeInTheDocument()
  })

  it('renderiza múltiples mensajes correctamente', () => {
    const messages = [
      makeMessage({ id: 1, content: 'Primer mensaje', message_type: 0 }),
      makeMessage({ id: 2, content: 'Segundo mensaje', message_type: 1, sender: { name: 'bot', type: 'agent_bot' } }),
    ]
    render(<ConversationThread messages={messages} isConnected={true} />)
    expect(screen.getByText('Primer mensaje')).toBeInTheDocument()
    expect(screen.getByText('Segundo mensaje')).toBeInTheDocument()
    expect(screen.getByText('Agente IA')).toBeInTheDocument()
  })

  it('renderiza un <audio> player cuando el mensaje tiene un attachment de tipo audio sin content', () => {
    const msg = makeMessage({
      content: '',
      attachments: [
        { id: 10, file_type: 'audio', file_url: 'https://example.com/audio.ogg' },
      ],
    })
    const { container } = render(<ConversationThread messages={[msg]} isConnected={true} />)
    const audioEl = container.querySelector('audio')
    expect(audioEl).toBeInTheDocument()
    expect(audioEl).toHaveAttribute('src', 'https://example.com/audio.ogg')
  })

  it('usa data_url del attachment de audio si está disponible', () => {
    const msg = makeMessage({
      content: '',
      attachments: [
        {
          id: 11,
          file_type: 'audio',
          file_url: 'https://example.com/audio.ogg',
          data_url: 'data:audio/ogg;base64,abc123',
        },
      ],
    })
    const { container } = render(<ConversationThread messages={[msg]} isConnected={true} />)
    const audioEl = container.querySelector('audio')
    expect(audioEl).toBeInTheDocument()
    expect(audioEl).toHaveAttribute('src', 'data:audio/ogg;base64,abc123')
  })

  it('renderiza texto + audio cuando el mensaje tiene content y attachment de audio', () => {
    const msg = makeMessage({
      content: 'Hola, ¿cómo estás?',
      attachments: [
        { id: 12, file_type: 'audio', file_url: 'https://example.com/audio.ogg' },
      ],
    })
    const { container } = render(<ConversationThread messages={[msg]} isConnected={true} />)
    expect(screen.getByText('Hola, ¿cómo estás?')).toBeInTheDocument()
    expect(container.querySelector('audio')).toBeInTheDocument()
  })

  it('reemplaza [audio_transcription]: con prefijo visual "🎤 Audio transcripto:"', () => {
    const msg = makeMessage({
      content: '[audio_transcription]: Quiero un turno para el lunes',
    })
    render(<ConversationThread messages={[msg]} isConnected={true} />)
    expect(screen.getByText('🎤 Audio transcripto:')).toBeInTheDocument()
    expect(screen.getByText('Quiero un turno para el lunes')).toBeInTheDocument()
    expect(screen.queryByText('[audio_transcription]: Quiero un turno para el lunes')).not.toBeInTheDocument()
  })

  it('no renderiza attachment de tipo imagen como audio player', () => {
    const msg = makeMessage({
      content: '',
      attachments: [
        { id: 13, file_type: 'image', file_url: 'https://example.com/image.jpg' },
      ],
    })
    const { container } = render(<ConversationThread messages={[msg]} isConnected={true} />)
    expect(container.querySelector('audio')).not.toBeInTheDocument()
  })
})
