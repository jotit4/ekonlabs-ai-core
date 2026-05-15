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
})
