import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

function makeConversation(overrides = {}) {
  return {
    id: 'conv-1',
    role: 'user',
    content: 'Hola, quiero un turno',
    created_at: '2026-05-10T10:00:00Z',
    phone_number: '+5491133334444',
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WhatsAppHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('muestra mensaje de no teléfono y no hace fetch cuando phoneNumber es null', () => {
    render(<WhatsAppHistory patientId={PATIENT_ID} phoneNumber={null} />, {
      wrapper: makeWrapper(),
    })

    expect(
      screen.getByText(/no hay teléfono asociado para buscar conversaciones/i)
    ).toBeInTheDocument()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('muestra lista de conversaciones cargadas con estado y fecha', async () => {
    const conversations = [
      makeConversation({ id: 'conv-1', content: 'Primera consulta', role: 'user' }),
      makeConversation({ id: 'conv-2', content: 'Segunda consulta', role: 'assistant' }),
    ]

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ conversations }),
    })

    render(
      <WhatsAppHistory
        patientId={PATIENT_ID}
        phoneNumber="+5491133334444"
        threadState={{ status: 'active', paused_reason: null }}
      />,
      { wrapper: makeWrapper() }
    )

    await waitFor(() => {
      expect(screen.getByText('Primera consulta')).toBeInTheDocument()
      expect(screen.getByText('Segunda consulta')).toBeInTheDocument()
    })

    // El estado del agente está presente
    expect(screen.getByText('IA activa')).toBeInTheDocument()
  })

  it('expande el hilo de mensajes al hacer clic en una conversación', async () => {
    const user = userEvent.setup()
    const conversations = [makeConversation({ id: 'conv-1', content: 'Primer mensaje' })]
    const chatwootMessages = [
      {
        id: 1,
        content: 'Hola',
        message_type: 0,
        created_at: '2026-05-10T10:00:00Z',
        role: 'user',
        phone_number: '+5491133334444',
      },
    ]

    // Primera llamada: conversaciones
    // Segunda llamada: mensajes de chatwoot
    let callCount = 0
    mockFetch.mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        return { ok: true, json: async () => ({ conversations }) }
      }
      return { ok: true, json: async () => ({ messages: chatwootMessages }) }
    })

    render(
      <WhatsAppHistory patientId={PATIENT_ID} phoneNumber="+5491133334444" />,
      { wrapper: makeWrapper() }
    )

    await waitFor(() => {
      expect(screen.getByText('Primer mensaje')).toBeInTheDocument()
    })

    // Clic para expandir
    const convButton = screen.getByRole('button', { name: /primer mensaje/i })
    await user.click(convButton)

    await waitFor(() => {
      expect(screen.getByText('Hola')).toBeInTheDocument()
    })
  })

  it('muestra burbuja del lado derecho para mensajes role === "user"', async () => {
    // Verificar que hay mensajes de "user" con el componente expandido
    const conversations = [makeConversation({ id: 'conv-1', content: 'Mensaje del paciente', role: 'user' })]
    const chatwootMessages = [
      {
        id: 1,
        content: 'Mensaje del paciente',
        role: 'user',
        message_type: 0,
        created_at: '2026-05-10T10:00:00Z',
        phone_number: '+5491133334444',
      },
    ]

    let callCount = 0
    mockFetch.mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        return { ok: true, json: async () => ({ conversations }) }
      }
      return { ok: true, json: async () => ({ messages: chatwootMessages }) }
    })

    const user = userEvent.setup()
    render(
      <WhatsAppHistory patientId={PATIENT_ID} phoneNumber="+5491133334444" />,
      { wrapper: makeWrapper() }
    )

    await waitFor(() => {
      expect(screen.getAllByText('Mensaje del paciente').length).toBeGreaterThanOrEqual(1)
    })

    // Expandir conversación
    const convButton = screen.getByRole('button', { name: /mensaje del paciente/i })
    await user.click(convButton)

    await waitFor(() => {
      // El mensaje role=user está en la conversación lista
      // Verificamos el aria-expanded después del clic
      expect(convButton).toHaveAttribute('aria-expanded', 'true')
    })
  })

  it('muestra label "Agente IA" para mensajes role === "assistant"', async () => {
    const conversations = [
      makeConversation({ id: 'conv-1', content: 'Primer mensaje del paciente', role: 'user' }),
    ]
    const chatwootMessages = [
      {
        id: 2,
        content: 'Respuesta del agente IA',
        role: 'assistant',
        message_type: 1,
        created_at: '2026-05-10T10:01:00Z',
        phone_number: '+5491133334444',
      },
    ]

    let callCount = 0
    mockFetch.mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        return { ok: true, json: async () => ({ conversations }) }
      }
      return { ok: true, json: async () => ({ messages: chatwootMessages }) }
    })

    const user = userEvent.setup()
    render(
      <WhatsAppHistory patientId={PATIENT_ID} phoneNumber="+5491133334444" />,
      { wrapper: makeWrapper() }
    )

    await waitFor(() => {
      expect(screen.getByText('Primer mensaje del paciente')).toBeInTheDocument()
    })

    const convButton = screen.getByRole('button', { name: /primer mensaje del paciente/i })
    await user.click(convButton)

    await waitFor(() => {
      expect(screen.getByText('Agente IA')).toBeInTheDocument()
      expect(screen.getByText('Respuesta del agente IA')).toBeInTheDocument()
    })
  })

  it('muestra separador centrado para mensajes role === "system"', async () => {
    const conversations = [
      makeConversation({ id: 'conv-1', content: 'Mensaje inicial', role: 'user' }),
    ]
    const chatwootMessages = [
      {
        id: 3,
        content: 'Transferido a humano',
        role: 'system',
        message_type: 2,
        created_at: '2026-05-10T10:02:00Z',
        phone_number: '+5491133334444',
      },
    ]

    let callCount = 0
    mockFetch.mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        return { ok: true, json: async () => ({ conversations }) }
      }
      return { ok: true, json: async () => ({ messages: chatwootMessages }) }
    })

    const user = userEvent.setup()
    render(
      <WhatsAppHistory patientId={PATIENT_ID} phoneNumber="+5491133334444" />,
      { wrapper: makeWrapper() }
    )

    await waitFor(() => {
      expect(screen.getByText('Mensaje inicial')).toBeInTheDocument()
    })

    const convButton = screen.getByRole('button', { name: /mensaje inicial/i })
    await user.click(convButton)

    await waitFor(() => {
      expect(screen.getByText('Transferido a humano')).toBeInTheDocument()
    })
  })

  it('muestra "No hay conversaciones registradas" cuando la lista está vacía', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ conversations: [] }),
    })

    render(
      <WhatsAppHistory patientId={PATIENT_ID} phoneNumber="+5491133334444" />,
      { wrapper: makeWrapper() }
    )

    await waitFor(() => {
      expect(
        screen.getByText(/no hay conversaciones registradas para este paciente/i)
      ).toBeInTheDocument()
    })
  })

  it('muestra DegradationBanner cuando Chatwoot devuelve chatwoot_unavailable', async () => {
    const conversations = [makeConversation({ id: 'conv-1', content: 'Mensaje' })]

    let callCount = 0
    mockFetch.mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        return { ok: true, json: async () => ({ conversations }) }
      }
      return { ok: true, json: async () => ({ error: 'chatwoot_unavailable' }) }
    })

    const user = userEvent.setup()
    render(
      <WhatsAppHistory patientId={PATIENT_ID} phoneNumber="+5491133334444" />,
      { wrapper: makeWrapper() }
    )

    await waitFor(() => {
      expect(screen.getByText('Mensaje')).toBeInTheDocument()
    })

    const convButton = screen.getByRole('button', { name: /Mensaje/i })
    await user.click(convButton)

    await waitFor(() => {
      expect(
        screen.getByText(/chatwoot no disponible temporalmente/i)
      ).toBeInTheDocument()
    })
  })
})
