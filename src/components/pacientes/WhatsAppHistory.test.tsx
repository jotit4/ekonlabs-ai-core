import { render, screen, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Mock de fetch global
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { WhatsAppHistory } from './WhatsAppHistory'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

const PATIENT_ID = 'patient-uuid-1'
const PHONE = '+5491133334444'
const PHONE_NO_PLUS = '5491133334444'

// Chatwoot messages — created_at en SEGUNDOS (Unix timestamp)
function makeChatwootMessage(overrides = {}) {
  return {
    id: 1,
    content: 'Hola, quiero un turno',
    message_type: 0, // 0 = incoming (paciente)
    created_at: 1715000000, // Unix timestamp en SEGUNDOS
    sender: { name: 'Paciente', type: 'contact' },
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WhatsAppHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('muestra mensaje de no teléfono y NO hace fetch cuando phoneNumber es null', () => {
    render(<WhatsAppHistory patientId={PATIENT_ID} phoneNumber={null} />, {
      wrapper: makeWrapper(),
    })

    expect(
      screen.getByText(/no hay teléfono asociado para buscar conversaciones/i)
    ).toBeInTheDocument()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('hace fetch SOLO a Chatwoot con phoneNumber sin + (sin query a patients/conversations)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [] }),
    })

    render(
      <WhatsAppHistory patientId={PATIENT_ID} phoneNumber={PHONE} />,
      { wrapper: makeWrapper() }
    )

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        `/api/chatwoot/conversations/${PHONE_NO_PLUS}/messages`
      )
    })

    // NO debe llamar a /api/patients/.../conversations
    expect(mockFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/patients/')
    )
  })

  it('muestra mensajes de Chatwoot con estado del agente visible', async () => {
    const messages = [
      makeChatwootMessage({ id: 1, content: 'Hola del paciente', message_type: 0 }),
      makeChatwootMessage({ id: 2, content: 'Respuesta del agente', message_type: 1, sender: { name: 'Bot', type: 'agent_bot' } }),
    ]

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messages }),
    })

    render(
      <WhatsAppHistory
        patientId={PATIENT_ID}
        phoneNumber={PHONE}
        threadState={{ status: 'active', paused_reason: null }}
      />,
      { wrapper: makeWrapper() }
    )

    await waitFor(() => {
      expect(screen.getByText('Hola del paciente')).toBeInTheDocument()
      expect(screen.getByText('Respuesta del agente')).toBeInTheDocument()
    })

    // El estado del agente está presente
    expect(screen.getByText('IA activa')).toBeInTheDocument()
  })

  it('muestra label "Agente IA" para message_type=1 con sender type agent_bot', async () => {
    const messages = [
      makeChatwootMessage({ id: 1, content: 'Respuesta del bot', message_type: 1, sender: { name: 'Bot', type: 'agent_bot' } }),
    ]

    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ messages }) })

    render(<WhatsAppHistory patientId={PATIENT_ID} phoneNumber={PHONE} />, { wrapper: makeWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Agente IA')).toBeInTheDocument()
      expect(screen.getByText('Respuesta del bot')).toBeInTheDocument()
    })
  })

  it('muestra separador centrado para message_type=2 (activity)', async () => {
    const messages = [
      makeChatwootMessage({ id: 1, content: 'Transferido a humano', message_type: 2 }),
    ]

    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ messages }) })

    render(<WhatsAppHistory patientId={PATIENT_ID} phoneNumber={PHONE} />, { wrapper: makeWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Transferido a humano')).toBeInTheDocument()
    })
  })

  it('muestra "No hay conversaciones registradas" cuando Chatwoot retorna array vacío', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [] }),
    })

    render(
      <WhatsAppHistory patientId={PATIENT_ID} phoneNumber={PHONE} />,
      { wrapper: makeWrapper() }
    )

    await waitFor(() => {
      expect(
        screen.getByText(/no hay conversaciones registradas para este paciente/i)
      ).toBeInTheDocument()
    })
  })

  it('muestra DegradationBanner cuando Chatwoot retorna chatwoot_unavailable', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ error: 'chatwoot_unavailable' }),
    })

    render(
      <WhatsAppHistory patientId={PATIENT_ID} phoneNumber={PHONE} />,
      { wrapper: makeWrapper() }
    )

    await waitFor(() => {
      expect(
        screen.getByText(/chatwoot no disponible temporalmente/i)
      ).toBeInTheDocument()
    })
  })

  it('NO muestra DegradationBanner cuando Chatwoot responde con mensajes', async () => {
    const messages = [makeChatwootMessage({ id: 1, content: 'Mensaje real' })]
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ messages }) })

    render(
      <WhatsAppHistory patientId={PATIENT_ID} phoneNumber={PHONE} />,
      { wrapper: makeWrapper() }
    )

    await waitFor(() => {
      expect(screen.getByText('Mensaje real')).toBeInTheDocument()
    })

    expect(screen.queryByText(/chatwoot no disponible/i)).not.toBeInTheDocument()
  })

  it('normaliza correctamente phoneNumber sin + (sin prefijo + ya)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [] }),
    })

    render(
      <WhatsAppHistory patientId={PATIENT_ID} phoneNumber={PHONE_NO_PLUS} />,
      { wrapper: makeWrapper() }
    )

    await waitFor(() => {
      // Con phoneNumber sin +, usa el mismo valor directamente
      expect(mockFetch).toHaveBeenCalledWith(
        `/api/chatwoot/conversations/${PHONE_NO_PLUS}/messages`
      )
    })
  })
})
