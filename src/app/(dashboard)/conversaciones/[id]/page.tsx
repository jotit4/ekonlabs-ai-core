'use client'

import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useChatwootMessages } from '@/hooks/use-chatwoot-messages'
import { ConversationThread } from '@/components/conversaciones/ConversationThread'
import { PatientContextPanel } from '@/components/conversaciones/PatientContextPanel'
import { TakeoverBar } from '@/components/conversaciones/TakeoverBar'
import type { ConversationSummary, ConversationStatus, ConfidenceLevel } from '@/types/conversations'

export default function ConversationThreadPage() {
  const params = useParams<{ id: string }>()
  const conversationId = params?.id ?? ''

  const { messages, isConnected, isLoading } = useChatwootMessages(conversationId)

  // Suscribir reactivamente a la lista de conversaciones para detectar cambios de estado
  const { data: conversations, isPending: isConversationsPending } = useQuery<ConversationSummary[]>({
    queryKey: ['conversations', 'list', { status: 'all' }],
    queryFn: async () => {
      const res = await fetch('/api/conversations')
      if (!res.ok) throw new Error('Error al cargar conversaciones')
      const json = await res.json() as { conversations: ConversationSummary[] }
      return json.conversations
    },
    staleTime: 0,
  })
  const conversation = conversations?.find((c) => c.phone_number === conversationId)
  const conversationStatus: ConversationStatus = conversation?.status ?? 'ai_active'
  const confidenceLevel: ConfidenceLevel = conversation?.confidence_level ?? 'medium'

  // Estado vacío cuando id es inválido
  if (!conversationId) {
    return (
      <main
        id="main-content"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}
      >
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
          Conversación no encontrada.
        </p>
      </main>
    )
  }

  // Conversación no encontrada en cache (después de que la query completó)
  if (!isConversationsPending && conversations !== undefined && !conversation) {
    return (
      <main
        id="main-content"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}
      >
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
          Conversación no encontrada.
        </p>
      </main>
    )
  }

  return (
    <main
      id="main-content"
      className="grid grid-cols-1 lg:grid-cols-[1fr_264px] h-full overflow-hidden"
    >
      {/* Columna 1: Hilo de conversación + TakeoverBar sticky al fondo */}
      <section
        style={{ borderRight: '1px solid var(--color-border)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        aria-label="Hilo de conversación"
      >
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {isLoading ? (
            <div
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}
              role="status"
              aria-label="Cargando mensajes"
            >
              <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>Cargando mensajes...</p>
            </div>
          ) : (
            <ConversationThread messages={messages} isConnected={isConnected} />
          )}
        </div>

        {/* TakeoverBar sticky al fondo de la columna del hilo */}
        <TakeoverBar
          phone={conversationId}
          conversationStatus={conversationStatus}
          confidenceLevel={confidenceLevel}
        />
      </section>

      {/* Columna 2: Panel de contexto capturado por el agente */}
      <PatientContextPanel phone={conversationId} />
    </main>
  )
}
