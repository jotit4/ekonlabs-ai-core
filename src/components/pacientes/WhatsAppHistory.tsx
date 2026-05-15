'use client'

import { useQuery } from '@tanstack/react-query'
import { PatientStatusBadge } from './PatientStatusBadge'
import { DegradationBanner } from './DegradationBanner'
import type { ChatwootMessage } from '@/types/conversations'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ThreadState {
  status: 'active' | 'paused'
  paused_reason: string | null
}

interface WhatsAppHistoryProps {
  patientId: string
  phoneNumber: string | null
  threadState?: ThreadState | null
}

// ─── Skeleton de burbujas ─────────────────────────────────────────────────────

function ChatSkeleton() {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }} aria-label="Cargando mensajes">
      {[1, 2, 3].map((i) => (
        <li
          key={i}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: i % 2 === 0 ? 'flex-end' : 'flex-start',
            margin: '4px 0',
            listStyle: 'none',
          }}
        >
          <div
            className="animate-pulse"
            style={{
              width: `${40 + i * 15}%`,
              height: 40,
              borderRadius: 12,
              backgroundColor: 'var(--color-bg-subtle, #f5f5f7)',
            }}
          />
        </li>
      ))}
    </ul>
  )
}

// ─── ChatBubble — burbuja para mensajes de Chatwoot ──────────────────────────

function ChatBubble({ message }: { message: ChatwootMessage }) {
  const isIncoming = message.message_type === 0 // paciente
  const isActivity = message.message_type === 2 // separador de actividad
  const isBot = message.message_type === 1 && message.sender?.type === 'agent_bot'
  const isHuman = message.message_type === 1 && message.sender?.type === 'agent'

  // created_at de Chatwoot está en SEGUNDOS — multiplicar × 1000
  const date = new Date(message.created_at * 1000)
  const timestamp = `${date.getDate()} ${date.toLocaleString('es', { month: 'short' })} · ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`

  // Separador de actividad (takeover/release)
  if (isActivity) {
    return (
      <li
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          margin: '8px 0',
          listStyle: 'none',
        }}
      >
        <hr style={{ flex: 1, border: 'none', borderTop: '1px solid rgba(0,0,0,0.1)' }} />
        <span
          style={{ fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}
        >
          {message.content}
        </span>
        <hr style={{ flex: 1, border: 'none', borderTop: '1px solid rgba(0,0,0,0.1)' }} />
      </li>
    )
  }

  // Etiqueta sobre la burbuja (solo para mensajes salientes)
  let label: string | null = null
  if (isBot) label = 'Agente IA'
  if (isHuman) label = message.sender?.name ?? 'Humano'

  const isOutgoing = !isIncoming // message_type === 1

  return (
    <li
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isOutgoing ? 'flex-end' : 'flex-start',
        margin: '4px 0',
        listStyle: 'none',
      }}
    >
      {label && (
        <span
          style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 2 }}
        >
          {label}
        </span>
      )}
      <div
        style={{
          maxWidth: '75%',
          padding: '8px 12px',
          borderRadius: isOutgoing ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
          backgroundColor: isOutgoing ? 'var(--color-interactive, #0071e3)' : 'var(--color-surface, #fff)',
          color: isOutgoing ? '#fff' : 'var(--color-text-primary)',
          border: isOutgoing ? 'none' : '1px solid rgba(0,0,0,0.1)',
          fontSize: 15,
        }}
      >
        {message.content}
      </div>
      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
        {timestamp}
      </span>
    </li>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function WhatsAppHistory({ patientId: _patientId, phoneNumber, threadState }: WhatsAppHistoryProps) {
  // Sin teléfono asociado → guard temprano, sin fetch
  if (!phoneNumber) {
    return (
      <section aria-label="Conversaciones WhatsApp">
        <p style={{ fontSize: 15, color: 'var(--color-text-secondary)' }}>
          No hay teléfono asociado para buscar conversaciones.
        </p>
      </section>
    )
  }

  // Normalizar phoneNumber: quitar el + inicial para que matchee /^\d{9,}$/ en el route de Chatwoot
  const chatwootConvId = phoneNumber.startsWith('+') ? phoneNumber.slice(1) : phoneNumber

  return <WhatsAppHistoryInner chatwootConvId={chatwootConvId} threadState={threadState} />
}

// ─── Inner component (separado para evitar hooks condicionales) ───────────────

function WhatsAppHistoryInner({
  chatwootConvId,
  threadState,
}: {
  chatwootConvId: string
  threadState?: ThreadState | null
}) {
  const { data, isPending, isError } = useQuery<{ messages?: ChatwootMessage[]; error?: string }>({
    queryKey: ['chatwoot', 'messages', chatwootConvId],
    queryFn: async () => {
      const res = await fetch(`/api/chatwoot/conversations/${chatwootConvId}/messages`)
      return res.json() as Promise<{ messages?: ChatwootMessage[]; error?: string }>
    },
    staleTime: 0,
  })

  const messages = data?.messages ?? []
  const isChatwootUnavailable = isError || data?.error === 'chatwoot_unavailable'

  return (
    <section aria-label="Conversaciones WhatsApp">
      {/* Header con estado del agente */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Conversaciones WhatsApp</h3>
        <PatientStatusBadge threadState={threadState} />
      </div>

      {/* Estado loading */}
      {isPending && <ChatSkeleton />}

      {/* Chatwoot no disponible */}
      {!isPending && isChatwootUnavailable && <DegradationBanner />}

      {/* Vacío */}
      {!isPending && !isChatwootUnavailable && messages.length === 0 && (
        <p style={{ fontSize: 15, color: 'var(--color-text-secondary)', textAlign: 'center' }}>
          No hay conversaciones registradas para este paciente.
        </p>
      )}

      {/* Lista de mensajes */}
      {!isPending && !isChatwootUnavailable && messages.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {messages.map((msg) => (
            <ChatBubble key={msg.id} message={msg} />
          ))}
        </ul>
      )}
    </section>
  )
}
