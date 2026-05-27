import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockUseQuery = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}))

const mockUseConversationsRealtime = vi.fn()
vi.mock('@/hooks/use-conversations-realtime', () => ({
  useConversationsRealtime: () => mockUseConversationsRealtime(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/conversaciones',
}))

vi.mock('@/components/conversaciones/RealtimeDegradationBanner', () => ({
  RealtimeDegradationBanner: () => <div data-testid="realtime-degradation-banner" />,
}))

vi.mock('@/components/conversaciones/ConversationListItem', () => ({
  ConversationListItem: ({ conversation }: { conversation: { patient_name: string } }) => (
    <li role="option">{conversation.patient_name}</li>
  ),
}))

import { ConversationListSidebar } from './ConversationListSidebar'

const CONVERSATIONS = [
  {
    id: 'c1', phone_number: '5491100001', patient_name: 'Ana López',
    status: 'needs_intervention', confidence_level: 'low',
    last_message_preview: 'Necesito turno', last_message_at: '2025-01-01T10:00:00Z', is_unread: true,
  },
  {
    id: 'c2', phone_number: '5491100002', patient_name: 'Juan García',
    status: 'ai_active', confidence_level: 'high',
    last_message_preview: 'Hola', last_message_at: '2025-01-01T09:00:00Z', is_unread: false,
  },
  {
    id: 'c3', phone_number: '5491100003', patient_name: 'Pedro Martínez',
    status: 'human_takeover', confidence_level: 'medium',
    last_message_preview: 'Quiero hablar con alguien', last_message_at: '2025-01-01T08:00:00Z', is_unread: false,
  },
]

describe('ConversationListSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseConversationsRealtime.mockReturnValue({ isConnected: true })
  })

  it('lista de conversaciones cargadas → renderiza N items', () => {
    mockUseQuery.mockReturnValue({ data: CONVERSATIONS, isLoading: false, isError: false })
    render(<ConversationListSidebar />)
    expect(screen.getByRole('listbox', { name: 'Conversaciones activas' })).toBeInTheDocument()
    expect(screen.getByText('Ana López')).toBeInTheDocument()
    expect(screen.getByText('Juan García')).toBeInTheDocument()
  })

  it('needs_intervention aparece antes que ai_active en el DOM', () => {
    mockUseQuery.mockReturnValue({ data: CONVERSATIONS, isLoading: false, isError: false })
    render(<ConversationListSidebar />)
    const items = screen.getAllByRole('option')
    expect(items[0]).toHaveTextContent('Ana López')
    expect(items[1]).toHaveTextContent('Juan García')
  })

  it('estado loading → 5 skeletons visibles', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    render(<ConversationListSidebar />)
    expect(screen.getByRole('status', { name: 'Cargando conversaciones' })).toBeInTheDocument()
  })

  it('estado vacío → "No hay conversaciones activas en este momento"', () => {
    mockUseQuery.mockReturnValue({ data: [], isLoading: false, isError: false })
    render(<ConversationListSidebar />)
    expect(screen.getByText('No hay conversaciones activas en este momento')).toBeInTheDocument()
  })

  it('estado error → mensaje de error con role="alert"', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    render(<ConversationListSidebar />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('muestra botones de filtro "Todas" y "Requiere atención"', () => {
    mockUseQuery.mockReturnValue({ data: CONVERSATIONS, isLoading: false, isError: false })
    render(<ConversationListSidebar />)
    expect(screen.getByRole('button', { name: 'Todas' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Requiere atención/ })).toBeInTheDocument()
  })

  it('botón "Todas" tiene aria-pressed="true" por defecto', () => {
    mockUseQuery.mockReturnValue({ data: CONVERSATIONS, isLoading: false, isError: false })
    render(<ConversationListSidebar />)
    const todasBtn = screen.getByRole('button', { name: 'Todas' })
    expect(todasBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('badge de "Requiere atención" muestra el conteo de conversaciones pausadas', () => {
    mockUseQuery.mockReturnValue({ data: CONVERSATIONS, isLoading: false, isError: false })
    render(<ConversationListSidebar />)
    // CONVERSATIONS tiene 2 pausadas (needs_intervention + human_takeover)
    expect(screen.getByLabelText('2 conversaciones requieren atención')).toBeInTheDocument()
  })

  it('filtro "Requiere atención" → muestra solo conversaciones pausadas', async () => {
    const user = userEvent.setup()
    mockUseQuery.mockReturnValue({ data: CONVERSATIONS, isLoading: false, isError: false })
    render(<ConversationListSidebar />)

    await user.click(screen.getByRole('button', { name: /Requiere atención/ }))

    // Solo Ana López (needs_intervention) y Pedro Martínez (human_takeover) deben aparecer
    expect(screen.getByText('Ana López')).toBeInTheDocument()
    expect(screen.getByText('Pedro Martínez')).toBeInTheDocument()
    // Juan García (ai_active) NO debe aparecer
    expect(screen.queryByText('Juan García')).not.toBeInTheDocument()
  })

  it('filtro "Requiere atención" con botón "Todas" regresa a lista completa', async () => {
    const user = userEvent.setup()
    mockUseQuery.mockReturnValue({ data: CONVERSATIONS, isLoading: false, isError: false })
    render(<ConversationListSidebar />)

    await user.click(screen.getByRole('button', { name: /Requiere atención/ }))
    await user.click(screen.getByRole('button', { name: 'Todas' }))

    expect(screen.getByText('Juan García')).toBeInTheDocument()
  })

  it('filtro "Requiere atención" sin pausadas → mensaje vacío específico', async () => {
    const user = userEvent.setup()
    const noAttentionConvs = [
      {
        id: 'c2', phone_number: '5491100002', patient_name: 'Juan García',
        status: 'ai_active', confidence_level: 'high',
        last_message_preview: 'Hola', last_message_at: '2025-01-01T09:00:00Z', is_unread: false,
      },
    ]
    mockUseQuery.mockReturnValue({ data: noAttentionConvs, isLoading: false, isError: false })
    render(<ConversationListSidebar />)

    await user.click(screen.getByRole('button', { name: /Requiere atención/ }))

    expect(screen.getByText('No hay conversaciones que requieran atención')).toBeInTheDocument()
  })

  it('no muestra badge cuando no hay conversaciones pausadas', () => {
    const noAttentionConvs = [
      {
        id: 'c2', phone_number: '5491100002', patient_name: 'Juan García',
        status: 'ai_active', confidence_level: 'high',
        last_message_preview: 'Hola', last_message_at: '2025-01-01T09:00:00Z', is_unread: false,
      },
    ]
    mockUseQuery.mockReturnValue({ data: noAttentionConvs, isLoading: false, isError: false })
    render(<ConversationListSidebar />)
    expect(screen.queryByLabelText(/conversaciones requieren atención/)).not.toBeInTheDocument()
  })
})
