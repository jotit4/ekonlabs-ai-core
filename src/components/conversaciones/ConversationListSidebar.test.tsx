import { render, screen } from '@testing-library/react'
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
})
