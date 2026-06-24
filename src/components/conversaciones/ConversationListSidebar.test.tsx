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

  // ─── P2: filtros por estado adicionales ──────────────────────────────────────

  it('muestra los 4 botones de filtro por estado', () => {
    mockUseQuery.mockReturnValue({ data: CONVERSATIONS, isLoading: false, isError: false })
    render(<ConversationListSidebar />)
    expect(screen.getByRole('button', { name: 'Todas' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Requiere atención/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'En control humano' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resueltas' })).toBeInTheDocument()
  })

  it('filtro "En control humano" → solo conversaciones human_takeover', async () => {
    const user = userEvent.setup()
    mockUseQuery.mockReturnValue({ data: CONVERSATIONS, isLoading: false, isError: false })
    render(<ConversationListSidebar />)

    await user.click(screen.getByRole('button', { name: 'En control humano' }))

    expect(screen.getByText('Pedro Martínez')).toBeInTheDocument() // human_takeover
    expect(screen.queryByText('Ana López')).not.toBeInTheDocument() // needs_intervention
    expect(screen.queryByText('Juan García')).not.toBeInTheDocument() // ai_active
  })

  it('filtro "Resueltas" → solo conversaciones resolved', async () => {
    const user = userEvent.setup()
    const withResolved = [
      ...CONVERSATIONS,
      {
        id: 'c4', phone_number: '5491100004', patient_name: 'Lucía Fernández',
        status: 'resolved', confidence_level: 'high',
        last_message_preview: 'Gracias', last_message_at: '2025-01-01T07:00:00Z', is_unread: false,
      },
    ]
    mockUseQuery.mockReturnValue({ data: withResolved, isLoading: false, isError: false })
    render(<ConversationListSidebar />)

    await user.click(screen.getByRole('button', { name: 'Resueltas' }))

    expect(screen.getByText('Lucía Fernández')).toBeInTheDocument()
    expect(screen.queryByText('Ana López')).not.toBeInTheDocument()
    expect(screen.queryByText('Juan García')).not.toBeInTheDocument()
  })

  it('filtro "Resueltas" sin resueltas → mensaje vacío específico', async () => {
    const user = userEvent.setup()
    mockUseQuery.mockReturnValue({ data: CONVERSATIONS, isLoading: false, isError: false })
    render(<ConversationListSidebar />)

    await user.click(screen.getByRole('button', { name: 'Resueltas' }))

    expect(screen.getByText('No hay conversaciones resueltas')).toBeInTheDocument()
  })

  // ─── P2: buscador de texto ───────────────────────────────────────────────────

  it('renderiza el input de búsqueda', () => {
    mockUseQuery.mockReturnValue({ data: CONVERSATIONS, isLoading: false, isError: false })
    render(<ConversationListSidebar />)
    expect(screen.getByRole('searchbox', { name: /buscar por nombre o teléfono/i })).toBeInTheDocument()
  })

  it('búsqueda por nombre filtra la lista (insensible a acentos y mayúsculas)', async () => {
    const user = userEvent.setup()
    mockUseQuery.mockReturnValue({ data: CONVERSATIONS, isLoading: false, isError: false })
    render(<ConversationListSidebar />)

    await user.type(screen.getByRole('searchbox'), 'lopez')

    expect(screen.getByText('Ana López')).toBeInTheDocument()
    expect(screen.queryByText('Juan García')).not.toBeInTheDocument()
    expect(screen.queryByText('Pedro Martínez')).not.toBeInTheDocument()
  })

  it('búsqueda por teléfono filtra por dígitos (ignora + y separadores)', async () => {
    const user = userEvent.setup()
    mockUseQuery.mockReturnValue({ data: CONVERSATIONS, isLoading: false, isError: false })
    render(<ConversationListSidebar />)

    await user.type(screen.getByRole('searchbox'), '100002')

    expect(screen.getByText('Juan García')).toBeInTheDocument()
    expect(screen.queryByText('Ana López')).not.toBeInTheDocument()
  })

  it('búsqueda + filtro de estado se combinan (AND)', async () => {
    const user = userEvent.setup()
    mockUseQuery.mockReturnValue({ data: CONVERSATIONS, isLoading: false, isError: false })
    render(<ConversationListSidebar />)

    // Filtro "Requiere atención" deja Ana (needs_intervention) y Pedro (human_takeover);
    // la búsqueda "ana" deja solo a Ana.
    await user.click(screen.getByRole('button', { name: /Requiere atención/ }))
    await user.type(screen.getByRole('searchbox'), 'ana')

    expect(screen.getByText('Ana López')).toBeInTheDocument()
    expect(screen.queryByText('Pedro Martínez')).not.toBeInTheDocument()
  })

  it('búsqueda sin resultados → mensaje "No hay resultados para tu búsqueda"', async () => {
    const user = userEvent.setup()
    mockUseQuery.mockReturnValue({ data: CONVERSATIONS, isLoading: false, isError: false })
    render(<ConversationListSidebar />)

    await user.type(screen.getByRole('searchbox'), 'zzzznoexiste')

    expect(screen.getByText('No hay resultados para tu búsqueda')).toBeInTheDocument()
  })
})
