'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { PatientStatusBadge } from './PatientStatusBadge'
import { DegradationBanner } from './DegradationBanner'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ConversationSummary {
  id: string
  role: string
  content: string
  created_at: string
  phone_number: string
}

interface ThreadState {
  status: 'active' | 'paused'
  paused_reason: string | null
}

interface WhatsAppHistoryProps {
  patientId: string
  phoneNumber: string | null
  threadState?: ThreadState | null
}

// ─── Chat Bubble ──────────────────────────────────────────────────────────────

function ChatBubble({ message }: { message: ConversationSummary }) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'
  const timestamp = format(new Date(message.created_at), "d MMM · HH:mm", { locale: es })

  if (isSystem) {
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

  return (
    <li
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        margin: '4px 0',
        listStyle: 'none',
      }}
    >
      {!isUser && (
        <span
          style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 2 }}
        >
          Agente IA
        </span>
      )}
      <div
        style={{
          maxWidth: '75%',
          padding: '8px 12px',
          borderRadius: isUser ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
          backgroundColor: isUser ? 'var(--color-interactive, #0071e3)' : 'var(--color-surface, #fff)',
          color: isUser ? '#fff' : 'var(--color-text-primary)',
          border: isUser ? 'none' : '1px solid rgba(0,0,0,0.1)',
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

// ─── ConversationThread — muestra los mensajes de una conversación ────────────

function ConversationThread({ conversationId }: { conversationId: string }) {
  const { data, isPending, isError } = useQuery<{ messages?: ConversationSummary[]; error?: string }>({
    queryKey: ['chatwoot', 'messages', conversationId],
    queryFn: async () => {
      const res = await fetch(`/api/chatwoot/conversations/${conversationId}/messages`)
      return res.json() as Promise<{ messages?: ConversationSummary[]; error?: string }>
    },
    staleTime: 0,
  })

  if (isPending) return <ChatSkeleton />

  if (isError || data?.error === 'chatwoot_unavailable') {
    return <DegradationBanner />
  }

  const messages = data?.messages ?? []

  if (messages.length === 0) {
    return (
      <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', padding: '8px 0' }}>
        No hay mensajes en esta conversación.
      </p>
    )
  }

  return (
    <ul style={{ listStyle: 'none', padding: '8px 0', margin: 0 }}>
      {messages.map((msg) => (
        <ChatBubble key={msg.id} message={msg} />
      ))}
    </ul>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function WhatsAppHistory({ patientId, phoneNumber, threadState }: WhatsAppHistoryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const {
    data,
    isPending,
    isError,
  } = useQuery<{ conversations: ConversationSummary[] }>({
    queryKey: ['patients', patientId, 'conversations'],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${patientId}/conversations`)
      return res.json() as Promise<{ conversations: ConversationSummary[] }>
    },
    staleTime: 0,
    enabled: !!phoneNumber,
  })

  // Sin teléfono asociado
  if (!phoneNumber) {
    return (
      <section aria-label="Conversaciones WhatsApp">
        <p style={{ fontSize: 15, color: 'var(--color-text-secondary)' }}>
          No hay teléfono asociado para buscar conversaciones.
        </p>
      </section>
    )
  }

  const conversations = data?.conversations ?? []

  function toggleConversation(id: string) {
    setExpandedId((prev) => (prev === id ? null : id))
  }

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
      {isPending && (
        <div style={{ padding: '16px 0' }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-pulse"
              style={{
                height: 56,
                borderRadius: 8,
                backgroundColor: 'var(--color-bg-subtle, #f5f5f7)',
                marginBottom: 8,
              }}
            />
          ))}
        </div>
      )}

      {/* Estado error */}
      {isError && !isPending && (
        <p role="alert" style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
          Error al cargar conversaciones.
        </p>
      )}

      {/* Estado vacío */}
      {!isPending && !isError && conversations.length === 0 && (
        <p style={{ fontSize: 15, color: 'var(--color-text-secondary)', textAlign: 'center' }}>
          No hay conversaciones registradas para este paciente.
        </p>
      )}

      {/* Lista de conversaciones */}
      {!isPending && !isError && conversations.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {conversations.map((conv) => {
            const isExpanded = expandedId === conv.id
            const date = format(new Date(conv.created_at), "d MMM yyyy · HH:mm", { locale: es })

            return (
              <li
                key={conv.id}
                style={{
                  borderBottom: '1px solid rgba(0,0,0,0.06)',
                  marginBottom: 4,
                }}
              >
                <button
                  onClick={() => toggleConversation(conv.id)}
                  aria-expanded={isExpanded}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '12px 0',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    {date}
                  </span>
                  <span
                    style={{
                      fontSize: 14,
                      color: 'var(--color-text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '100%',
                    }}
                  >
                    {conv.content}
                  </span>
                </button>

                {isExpanded && (
                  <div style={{ paddingBottom: 12 }}>
                    <ConversationThread conversationId={conv.id} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
