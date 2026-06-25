'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useChatwootMessages } from '@/hooks/use-chatwoot-messages'
import { useConversationThreadRealtime } from '@/hooks/use-conversation-thread-realtime'
import { useUserRole } from '@/hooks/use-user-role'
import { useCurrentUser } from '@/hooks/use-current-user'
import { useMarkRead } from '@/hooks/use-mark-read'
import { useCurrentUserId } from '@/hooks/use-current-user-id'
import { ConversationThread } from '@/components/conversaciones/ConversationThread'
import { PatientContextPanel } from '@/components/conversaciones/PatientContextPanel'
import { TakeoverBar } from '@/components/conversaciones/TakeoverBar'
import { ResolveControl } from '@/components/conversaciones/ResolveControl'
import { ConversationNotes } from '@/components/conversaciones/ConversationNotes'
import { deriveControllerName } from '@/lib/conversaciones/thread-dates'
import type { ConversationSummary, ConversationStatus, ConfidenceLevel } from '@/types/conversations'

export default function ConversationThreadPage() {
  const params = useParams<{ id: string }>()
  const conversationId = decodeURIComponent(params?.id ?? '')

  const { messages, isConnected, isLoading } = useChatwootMessages(conversationId)
  useConversationThreadRealtime(conversationId)

  // Sólo admin/receptionist pueden corregir al agente (Story 6.8). El POST de KB
  // igual rechaza otros roles con 403 (guard de 6.7) — esto es defensa en profundidad UI.
  const role = useUserRole()
  const canCorrect = role === 'admin' || role === 'receptionist'

  // Quién está en control (P1.b). Fuente: el hilo de mensajes — el último mensaje
  // saliente de un agente humano lleva el nombre del operador (meta.agent.name).
  // Es la única señal disponible client-side: thread_states no guarda el usuario,
  // audit_logs es admin-only y el endpoint de takeover solo expone controlled_by en
  // el 409. Fallback: el nombre del usuario actual (recién tomó control, aún sin
  // mensajes propios en el hilo).
  const { user: currentUser } = useCurrentUser()
  const currentUserId = useCurrentUserId()
  const controlledBy = deriveControllerName(messages) ?? undefined

  // Suscribir reactivamente a la lista de conversaciones para detectar cambios de estado
  const { data: conversations, isPending: isConversationsPending } = useQuery<ConversationSummary[]>({
    queryKey: ['conversations', 'list', { status: 'all' }],
    queryFn: async () => {
      const res = await fetch('/api/conversations')
      if (!res.ok) throw new Error('Error al cargar conversaciones')
      const json = await res.json() as { conversations: ConversationSummary[] }
      return json.conversations
    },
    staleTime: 30_000,
  })
  const conversation = conversations?.find((c) => c.phone_number === conversationId)
  const conversationStatus: ConversationStatus = conversation?.status ?? 'ai_active'
  const confidenceLevel: ConfidenceLevel = conversation?.confidence_level ?? 'medium'

  // B1: marcar como leída al abrir la conversación y cuando llegan mensajes nuevos.
  const { markRead } = useMarkRead()
  useEffect(() => {
    if (conversationId) {
      markRead(conversationId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, messages.length])

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
            <ConversationThread messages={messages} isConnected={isConnected} canCorrect={canCorrect} />
          )}
        </div>

        {/* TakeoverBar sticky al fondo de la columna del hilo */}
        <TakeoverBar
          phone={conversationId}
          conversationStatus={conversationStatus}
          confidenceLevel={confidenceLevel}
          controlledBy={controlledBy}
          currentUserName={currentUser?.fullName}
        />
      </section>

      {/* Columna 2: Panel de contexto + controles de resolución + notas */}
      <section
        style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column' }}
        aria-label="Panel lateral"
      >
        {/* PatientContextPanel ocupa la parte superior */}
        <PatientContextPanel phone={conversationId} />

        {/* B2: Resolver / Reabrir — debajo del contexto, fuera de TakeoverBar */}
        {conversationId && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--color-border)' }}>
            <ResolveControl
              phone={conversationId}
              conversationStatus={conversationStatus}
            />
          </div>
        )}

        {/* B3: Notas privadas internas */}
        {conversationId && currentUserId && (
          <ConversationNotes
            phone={conversationId}
            currentUserId={currentUserId}
          />
        )}
      </section>
    </main>
  )
}
