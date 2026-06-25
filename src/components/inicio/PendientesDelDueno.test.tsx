import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/hooks/use-deletion-requests', () => ({
  useDeletionRequests: vi.fn(),
}))

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
    [key: string]: unknown
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

import { useDeletionRequests } from '@/hooks/use-deletion-requests'
import { PendientesDelDueno } from './PendientesDelDueno'
import type { DeletionRequestRow } from '@/types/deletion-requests'
import type { ConversationSummary } from '@/types/conversations'

const mockUseDeletionRequests = vi.mocked(useDeletionRequests)

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

function mockConvFetch(conversations: Partial<ConversationSummary>[]) {
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ conversations }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function mockConvFetchError() {
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response('Internal Server Error', { status: 500 }),
  )
}

function mockDeletionRequests(
  overrides: Partial<{
    requests: DeletionRequestRow[]
    isPending: boolean
    isError: boolean
  }> = {},
) {
  mockUseDeletionRequests.mockReturnValue({
    requests: [],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  })
}

const pendingRequest: DeletionRequestRow = {
  patient_id: 'p1',
  full_name: 'Juan Pérez',
  dni: '12345678',
  deletion_requested_at: '2026-06-20T10:00:00Z',
  deletion_effective_at: '2026-07-20T10:00:00Z',
  status: 'pending',
}

const processedRequest: DeletionRequestRow = {
  ...pendingRequest,
  patient_id: 'p2',
  status: 'processed',
}

const escaladaConv: Partial<ConversationSummary> = {
  id: 'conv-1',
  phone_number: '+5492615000001',
  status: 'needs_intervention',
  patient_name: 'Ana García',
  confidence_level: 'low',
  last_message_preview: 'quiero cancelar',
  last_message_at: '2026-06-25T10:00:00Z',
  is_unread: true,
}

const takeoverConv: Partial<ConversationSummary> = {
  id: 'conv-2',
  phone_number: '+5492615000002',
  status: 'human_takeover',
  patient_name: 'Carlos López',
  confidence_level: 'medium',
  last_message_preview: 'ok',
  last_message_at: '2026-06-25T09:00:00Z',
  is_unread: false,
}

const activeConv: Partial<ConversationSummary> = {
  id: 'conv-3',
  phone_number: '+5492615000003',
  status: 'ai_active',
  patient_name: 'María',
  confidence_level: 'high',
  last_message_preview: 'hola',
  last_message_at: '2026-06-25T08:00:00Z',
  is_unread: false,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PendientesDelDueno', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Estado de carga ────────────────────────────────────────────────────────

  it('muestra "Verificando" cuando alguna fuente sigue cargando', () => {
    mockDeletionRequests({ isPending: true })
    vi.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {}))

    render(<PendientesDelDueno />, { wrapper: makeWrapper() })
    expect(screen.getByText(/Verificando/)).toBeInTheDocument()
  })

  // ── Estado vacío ───────────────────────────────────────────────────────────

  it('muestra "Estás al día" cuando no hay escaladas ni supresiones', async () => {
    mockDeletionRequests({ requests: [] })
    mockConvFetch([])

    render(<PendientesDelDueno />, { wrapper: makeWrapper() })
    await screen.findByText('Estás al día')
    expect(screen.getByText(/No hay nada que requiera tu atención ahora/)).toBeInTheDocument()
  })

  it('no muestra ningún link cuando está al día', async () => {
    mockDeletionRequests({ requests: [] })
    mockConvFetch([])

    render(<PendientesDelDueno />, { wrapper: makeWrapper() })
    await screen.findByText('Estás al día')
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('ignora supresiones ya procesadas en el conteo', async () => {
    mockDeletionRequests({ requests: [processedRequest] })
    mockConvFetch([])

    render(<PendientesDelDueno />, { wrapper: makeWrapper() })
    await screen.findByText('Estás al día')
  })

  it('ignora conversaciones no escaladas (ai_active) en el conteo', async () => {
    mockDeletionRequests({ requests: [] })
    mockConvFetch([activeConv])

    render(<PendientesDelDueno />, { wrapper: makeWrapper() })
    await screen.findByText('Estás al día')
  })

  // ── Conversaciones escaladas ───────────────────────────────────────────────

  it('muestra "1 conversación escalada" (singular) con link a /conversaciones', async () => {
    mockDeletionRequests({ requests: [] })
    mockConvFetch([escaladaConv])

    render(<PendientesDelDueno />, { wrapper: makeWrapper() })
    await screen.findByText('1 conversación escalada')
    expect(screen.getByRole('link', { name: /conversaci[oó]n escalada/i })).toHaveAttribute(
      'href',
      '/conversaciones',
    )
  })

  it('muestra "N conversaciones escaladas" (plural) sumando needs_intervention + human_takeover', async () => {
    mockDeletionRequests({ requests: [] })
    mockConvFetch([escaladaConv, takeoverConv])

    render(<PendientesDelDueno />, { wrapper: makeWrapper() })
    await screen.findByText('2 conversaciones escaladas')
  })

  // ── Supresiones pendientes ─────────────────────────────────────────────────

  it('muestra "1 solicitud de supresión pendiente" (singular) con link a /configuracion/supresion', async () => {
    mockDeletionRequests({ requests: [pendingRequest] })
    mockConvFetch([])

    render(<PendientesDelDueno />, { wrapper: makeWrapper() })
    await screen.findByText('1 solicitud de supresión pendiente')
    expect(
      screen.getByRole('link', { name: /solicitud de supresi[oó]n/i }),
    ).toHaveAttribute('href', '/configuracion/supresion')
  })

  it('muestra "N solicitudes de supresión pendientes" (plural)', async () => {
    mockDeletionRequests({
      requests: [
        pendingRequest,
        { ...pendingRequest, patient_id: 'p3' },
        { ...pendingRequest, patient_id: 'p4' },
      ],
    })
    mockConvFetch([])

    render(<PendientesDelDueno />, { wrapper: makeWrapper() })
    await screen.findByText('3 solicitudes de supresión pendientes')
  })

  // ── Ambas fuentes con pendientes ───────────────────────────────────────────

  it('muestra ambas filas cuando hay escaladas Y supresiones', async () => {
    mockDeletionRequests({ requests: [pendingRequest] })
    mockConvFetch([escaladaConv])

    render(<PendientesDelDueno />, { wrapper: makeWrapper() })
    await screen.findByText('1 conversación escalada')
    expect(screen.getByText('1 solicitud de supresión pendiente')).toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(2)
  })

  // ── Fail-soft ──────────────────────────────────────────────────────────────

  it('fail-soft: si conversations falla (500), muestra supresiones igual', async () => {
    mockDeletionRequests({ requests: [pendingRequest] })
    mockConvFetchError()

    render(<PendientesDelDueno />, { wrapper: makeWrapper() })
    await screen.findByText('1 solicitud de supresión pendiente')
    // No debe romperse ni mostrar error global
    expect(screen.queryByText(/Estás al día/)).toBeNull()
  })

  it('fail-soft: si supresiones falla (isError:true), muestra escaladas igual', async () => {
    mockDeletionRequests({ isError: true, requests: [] })
    mockConvFetch([escaladaConv])

    render(<PendientesDelDueno />, { wrapper: makeWrapper() })
    await screen.findByText('1 conversación escalada')
    // No debe romperse por el error de supresiones
    expect(screen.queryByText(/Estás al día/)).toBeNull()
  })

  it('fail-soft: si ambas fallan, muestra "Estás al día" (sin pendientes visibles)', async () => {
    mockDeletionRequests({ isError: true, requests: [] })
    mockConvFetchError()

    render(<PendientesDelDueno />, { wrapper: makeWrapper() })
    await screen.findByText('Estás al día')
  })

  // ── queryKey compartida ────────────────────────────────────────────────────

  it('el título de la sección es "Pendientes que te necesitan"', async () => {
    mockDeletionRequests({ requests: [] })
    mockConvFetch([])

    render(<PendientesDelDueno />, { wrapper: makeWrapper() })
    expect(
      screen.getByRole('heading', { name: /Pendientes que te necesitan/ }),
    ).toBeInTheDocument()
  })
})
