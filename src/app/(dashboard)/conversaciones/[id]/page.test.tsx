import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock next/navigation
const mockUseParams = vi.fn()
vi.mock('next/navigation', () => ({
  useParams: () => mockUseParams(),
  useRouter: () => ({ push: vi.fn() }),
}))

// Mock @tanstack/react-query
const mockUseQuery = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}))

// Mock useChatwootMessages
const mockUseChatwootMessages = vi.fn()
vi.mock('@/hooks/use-chatwoot-messages', () => ({
  useChatwootMessages: (id: string) => mockUseChatwootMessages(id),
}))

// Mock ConversationThread
vi.mock('@/components/conversaciones/ConversationThread', () => ({
  ConversationThread: ({ messages, isConnected }: { messages: unknown[]; isConnected: boolean }) => (
    <div data-testid="conversation-thread" data-connected={String(isConnected)} data-count={messages.length}>
      ConversationThread
    </div>
  ),
}))

// Mock PatientContextPanel para evitar dependencia de QueryClient
vi.mock('@/components/conversaciones/PatientContextPanel', () => ({
  PatientContextPanel: ({ phone }: { phone: string }) => (
    <aside role="complementary" aria-label="Contexto de la conversación" data-testid="patient-context-panel" data-phone={phone}>
      PatientContextPanel
    </aside>
  ),
}))

// Mock TakeoverBar
vi.mock('@/components/conversaciones/TakeoverBar', () => ({
  TakeoverBar: ({ phone, conversationStatus }: { phone: string; conversationStatus: string }) => (
    <div data-testid="takeover-bar" data-phone={phone} data-status={conversationStatus}>
      TakeoverBar
    </div>
  ),
}))

import ConversationThreadPage from './page'

describe('ConversationThreadPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Por defecto, useQuery retorna sin datos y query completada
    mockUseQuery.mockReturnValue({ data: undefined, isPending: false })
  })

  it('renderiza ConversationThread con mensajes mockeados', () => {
    mockUseParams.mockReturnValue({ id: 'conv-123' })
    mockUseChatwootMessages.mockReturnValue({
      messages: [
        { id: 1, content: 'Hola', message_type: 0, created_at: 1715000000 },
        { id: 2, content: 'Necesito turno', message_type: 0, created_at: 1715000010 },
      ],
      isConnected: true,
      isLoading: false,
      isError: false,
    })

    render(<ConversationThreadPage />)
    const thread = screen.getByTestId('conversation-thread')
    expect(thread).toBeInTheDocument()
    expect(thread).toHaveAttribute('data-count', '2')
    expect(thread).toHaveAttribute('data-connected', 'true')
  })

  it('muestra estado vacío cuando no hay mensajes', () => {
    mockUseParams.mockReturnValue({ id: 'conv-123' })
    mockUseChatwootMessages.mockReturnValue({
      messages: [],
      isConnected: true,
      isLoading: false,
      isError: false,
    })

    render(<ConversationThreadPage />)
    const thread = screen.getByTestId('conversation-thread')
    expect(thread).toHaveAttribute('data-count', '0')
  })

  it('muestra DegradationBanner cuando isConnected === false', () => {
    mockUseParams.mockReturnValue({ id: 'conv-123' })
    mockUseChatwootMessages.mockReturnValue({
      messages: [],
      isConnected: false,
      isLoading: false,
      isError: true,
    })

    render(<ConversationThreadPage />)
    const thread = screen.getByTestId('conversation-thread')
    expect(thread).toHaveAttribute('data-connected', 'false')
  })

  it('muestra mensaje de error cuando conversationId es vacío', () => {
    mockUseParams.mockReturnValue({ id: '' })
    mockUseChatwootMessages.mockReturnValue({
      messages: [],
      isConnected: true,
      isLoading: false,
      isError: false,
    })

    render(<ConversationThreadPage />)
    expect(screen.getByText('Conversación no encontrada.')).toBeInTheDocument()
  })

  it('muestra loader mientras carga', () => {
    mockUseParams.mockReturnValue({ id: 'conv-123' })
    mockUseChatwootMessages.mockReturnValue({
      messages: [],
      isConnected: true,
      isLoading: true,
      isError: false,
    })

    render(<ConversationThreadPage />)
    expect(screen.getByText('Cargando mensajes...')).toBeInTheDocument()
  })

  it('TakeoverBar se renderiza con las props correctas (phone y status)', () => {
    mockUseParams.mockReturnValue({ id: 'conv-456' })
    mockUseChatwootMessages.mockReturnValue({
      messages: [],
      isConnected: true,
      isLoading: false,
      isError: false,
    })
    // Simular conversación en cache
    mockUseQuery.mockReturnValue({
      data: [
        {
          id: 'conv-456',
          phone_number: 'conv-456',
          patient_name: 'Test',
          status: 'needs_intervention',
          confidence_level: 'low',
          last_message_preview: '',
          last_message_at: '',
          is_unread: false,
        },
      ],
    })

    render(<ConversationThreadPage />)
    const takeoverBar = screen.getByTestId('takeover-bar')
    expect(takeoverBar).toBeInTheDocument()
    expect(takeoverBar).toHaveAttribute('data-phone', 'conv-456')
    expect(takeoverBar).toHaveAttribute('data-status', 'needs_intervention')
  })

  it('TakeoverBar usa ai_active como default cuando no hay conversación en cache', () => {
    mockUseParams.mockReturnValue({ id: 'conv-123' })
    mockUseChatwootMessages.mockReturnValue({
      messages: [],
      isConnected: true,
      isLoading: false,
      isError: false,
    })
    // useQuery sin datos — usa default
    mockUseQuery.mockReturnValue({ data: undefined })

    render(<ConversationThreadPage />)
    const takeoverBar = screen.getByTestId('takeover-bar')
    expect(takeoverBar).toHaveAttribute('data-status', 'ai_active')
  })

  it('el layout de 2 columnas (hilo + contexto) se mantiene correctamente', () => {
    mockUseParams.mockReturnValue({ id: 'conv-123' })
    mockUseChatwootMessages.mockReturnValue({
      messages: [],
      isConnected: true,
      isLoading: false,
      isError: false,
    })

    render(<ConversationThreadPage />)
    // Columna 1: hilo + TakeoverBar
    expect(screen.getByTestId('takeover-bar')).toBeInTheDocument()
    // Columna 2: contexto
    expect(screen.getByTestId('patient-context-panel')).toBeInTheDocument()
  })

  it('muestra "Conversación no encontrada." cuando la query completó y no hay conversación', () => {
    mockUseParams.mockReturnValue({ id: 'numero-inexistente' })
    mockUseChatwootMessages.mockReturnValue({
      messages: [],
      isConnected: false,
      isLoading: false,
      isError: false,
    })
    // Query completó (isPending: false), lista retornada (data: []), pero no hay match
    mockUseQuery.mockReturnValue({
      data: [], // lista vacía — conversación no encontrada
      isPending: false,
    })

    render(<ConversationThreadPage />)
    expect(screen.getByText('Conversación no encontrada.')).toBeInTheDocument()
  })

  it('NO muestra "no encontrada" cuando la query aún está cargando', () => {
    mockUseParams.mockReturnValue({ id: 'numero-inexistente' })
    mockUseChatwootMessages.mockReturnValue({
      messages: [],
      isConnected: false,
      isLoading: true,
      isError: false,
    })
    // Query en progreso — isPending: true
    mockUseQuery.mockReturnValue({
      data: undefined,
      isPending: true,
    })

    render(<ConversationThreadPage />)
    // En estado pendiente, no debe mostrar "no encontrada"
    expect(screen.queryByText('Conversación no encontrada.')).not.toBeInTheDocument()
  })
})
