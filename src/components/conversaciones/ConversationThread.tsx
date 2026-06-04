'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { DegradationBanner } from '@/components/pacientes/DegradationBanner'
import { CorreccionAgenteModal } from '@/components/conversaciones/CorreccionAgenteModal'
import { findPreviousPatientMessage } from '@/lib/conversaciones/correccion'
import type { ChatwootMessage } from '@/types/conversations'

interface ConversationThreadProps {
  messages: ChatwootMessage[]
  isConnected: boolean
  /** Si el rol del usuario puede escribir KB (admin/receptionist). Default false. */
  canCorrect?: boolean
}

function MessageBubble({
  message,
  canCorrect,
  onCorrect,
}: {
  message: ChatwootMessage
  canCorrect: boolean
  onCorrect: () => void
}) {
  const isIncoming = message.message_type === 0 // paciente
  const isActivity = message.message_type === 2 // separador
  const isBot = message.message_type === 1 && message.sender?.type === 'agent_bot'
  const isHuman = message.message_type === 1 && message.sender?.type === 'agent'

  // Timestamp: created_at está en SEGUNDOS — multiplicar por 1000
  const timestamp = format(new Date(message.created_at * 1000), 'HH:mm', { locale: es })

  // Separador de actividad (takeover/release)
  if (isActivity) {
    return (
      <li style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0', listStyle: 'none' }}>
        <hr style={{ flex: 1, border: 'none', borderTop: '1px solid var(--color-border)' }} />
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
          {message.content}
        </span>
        <hr style={{ flex: 1, border: 'none', borderTop: '1px solid var(--color-border)' }} />
      </li>
    )
  }

  // Etiqueta sobre la burbuja (solo para mensajes salientes)
  let label: string | null = null
  if (isBot) label = 'Agente IA'
  if (isHuman) label = `${message.meta?.agent?.name ?? message.sender?.name ?? 'Humano'} · En control`

  const isOutgoing = !isIncoming // message_type 1 (bot o humano)

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
          style={{
            fontSize: 12,
            color: isHuman ? 'var(--color-interactive)' : 'var(--color-text-secondary)',
            marginBottom: 2,
            fontWeight: isHuman ? 500 : 400,
          }}
        >
          {label}
        </span>
      )}
      <div
        style={{
          maxWidth: '75%',
          padding: '8px 12px',
          borderRadius: isOutgoing ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
          backgroundColor: isOutgoing ? 'var(--color-interactive)' : 'var(--color-surface)',
          color: isOutgoing ? '#fff' : 'var(--color-text-primary)',
          border: isOutgoing ? 'none' : '1px solid var(--color-border)',
          fontSize: 15,
        }}
      >
        {/* Texto del mensaje — si empieza con [audio_transcription]: mostrar prefijo visual */}
        {message.content && message.content.startsWith('[audio_transcription]:') ? (
          <span>
            <span style={{ fontSize: 12, opacity: 0.75, display: 'block', marginBottom: 4 }}>
              🎤 Audio transcripto:
            </span>
            {message.content.replace('[audio_transcription]:', '').trim()}
          </span>
        ) : message.content ? (
          message.content
        ) : null}

        {/* Audio attachment — renderizar si hay adjunto de tipo audio */}
        {message.attachments?.some((a) => a.file_type === 'audio') && (
          <div style={{ marginTop: message.content ? 8 : 0 }}>
            {message.attachments
              .filter((a) => a.file_type === 'audio')
              .map((a) => {
                // Usar data_url directamente si es un data URI (no tiene restricciones CORS).
                // Para URLs externas de Chatwoot, proxear via /api/media/audio para evitar
                // MEDIA_ELEMENT_ERROR code 4 (CORS/CSP cross-origin media block en el browser).
                const rawSrc = a.data_url ?? a.file_url
                const src =
                  rawSrc.startsWith('data:')
                    ? rawSrc
                    : `/api/media/audio?url=${encodeURIComponent(rawSrc)}`
                return (
                  <audio
                    key={a.id}
                    controls
                    src={src}
                    style={{ display: 'block', maxWidth: '100%', minWidth: 200 }}
                  >
                    Tu navegador no soporta reproducción de audio.
                  </audio>
                )
              })}
          </div>
        )}
      </div>
      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
        {timestamp}
      </span>

      {/* Botón "Corregir" — sólo en mensajes del agente y para roles con permiso (Story 6.8) */}
      {canCorrect && isOutgoing && (
        <button
          type="button"
          onClick={onCorrect}
          aria-label="Corregir esta respuesta del agente"
          style={{
            marginTop: 2,
            background: 'none',
            border: 'none',
            padding: '2px 0',
            minHeight: 28,
            fontSize: 12,
            color: 'var(--color-interactive)',
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          Corregir
        </button>
      )}
    </li>
  )
}

export function ConversationThread({ messages, isConnected, canCorrect = false }: ConversationThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [hasNewMessages, setHasNewMessages] = useState(false)
  const prevMessageCountRef = useRef(messages.length)

  // Estado del modal de corrección — id del mensaje del agente que se está corrigiendo (Story 6.8)
  const [correctingMessageId, setCorrectingMessageId] = useState<number | null>(null)
  const correctingMessage =
    correctingMessageId !== null
      ? messages.find((m) => m.id === correctingMessageId)
      : undefined

  // Detectar scroll position
  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const threshold = 50
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
    isAtBottomRef.current = atBottom
    setIsAtBottom(atBottom)
    if (atBottom) setHasNewMessages(false)
  }

  // Auto-scroll al montar
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [])

  // Auto-scroll o badge cuando llegan mensajes nuevos — usa ref para evitar setState en effect
  useEffect(() => {
    const newCount = messages.length
    const prevCount = prevMessageCountRef.current
    prevMessageCountRef.current = newCount

    if (newCount > prevCount) {
      if (isAtBottomRef.current) {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
      } else {
        // Marcar que hay nuevos mensajes — se ejecuta en respuesta a cambio externo (datos nuevos)
        setHasNewMessages(true)
      }
    }
  }, [messages.length])

  // Sincronizar ref con estado para el efecto de nuevos mensajes
  useEffect(() => {
    isAtBottomRef.current = isAtBottom
  }, [isAtBottom])

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    setHasNewMessages(false)
    setIsAtBottom(true)
    isAtBottomRef.current = true
  }

  return (
    <section
      aria-label="Hilo de conversación"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}
    >
      {/* Banner de degradación — solo cuando Chatwoot no responde */}
      {!isConnected && (
        <div style={{ padding: '8px 16px 0' }}>
          <DegradationBanner />
        </div>
      )}

      {/* Área scrolleable de mensajes */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{ flex: 1, overflowY: 'auto', padding: '16px' }}
      >
        {messages.length === 0 ? (
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', textAlign: 'center' }}>
            No hay mensajes en esta conversación.
          </p>
        ) : (
          <ul role="log" aria-live="polite" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                canCorrect={canCorrect}
                onCorrect={() => setCorrectingMessageId(msg.id)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Badge de nuevo mensaje — respetar prefers-reduced-motion */}
      {hasNewMessages && (
        <div
          style={{
            position: 'absolute',
            bottom: 80,
            left: '50%',
            transform: 'translateX(-50%)',
          }}
        >
          <button
            onClick={scrollToBottom}
            style={{
              background: 'var(--color-interactive)',
              color: '#fff',
              border: 'none',
              borderRadius: 20,
              padding: '6px 16px',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Nuevo mensaje ↓
          </button>
        </div>
      )}

      {/* Modal de corrección (Story 6.8) — montado desde el thread, no desde la burbuja */}
      {correctingMessage && (
        <CorreccionAgenteModal
          agentMessageContent={correctingMessage.content}
          patientQuestion={findPreviousPatientMessage(messages, correctingMessage.id)}
          onClose={() => setCorrectingMessageId(null)}
        />
      )}
    </section>
  )
}
