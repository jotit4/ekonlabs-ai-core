'use client'

import { useRef, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ConversationListItem } from '@/components/conversaciones/ConversationListItem'
import { RealtimeDegradationBanner } from '@/components/conversaciones/RealtimeDegradationBanner'
import { useConversationsRealtime } from '@/hooks/use-conversations-realtime'
import type { ConversationSummary } from '@/types/conversations'

function ConversationListSkeleton() {
  return (
    <ul aria-label="Cargando conversaciones" role="status">
      {Array.from({ length: 5 }).map((_, i) => (
        <li
          key={i}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', minHeight: 72 }}
        >
          <div className="h-2.5 w-2.5 rounded-full animate-pulse bg-[#f5f5f7]" />
          <div className="h-9 w-9 rounded-full animate-pulse bg-[#f5f5f7]" />
          <div style={{ flex: 1 }} className="space-y-2">
            <div className="h-4 w-3/4 animate-pulse rounded bg-[#f5f5f7]" />
            <div className="h-3 w-full animate-pulse rounded bg-[#f5f5f7]" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-[#f5f5f7]" />
          </div>
        </li>
      ))}
    </ul>
  )
}

async function fetchConversations(): Promise<ConversationSummary[]> {
  const res = await fetch('/api/conversations')
  if (!res.ok) throw new Error('Error al cargar conversaciones')
  const json = await res.json() as { conversations: ConversationSummary[] }
  return json.conversations
}

export function ConversationListSidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const listRef = useRef<HTMLUListElement>(null)

  // Extrae el phone_number del path: /conversaciones/{phone}
  const selectedPhone = pathname?.match(/\/conversaciones\/([^/]+)/)?.[1] ?? null

  const { isConnected } = useConversationsRealtime()

  const { data: conversations = [], isLoading, isError } = useQuery<ConversationSummary[]>({
    queryKey: ['conversations', 'list', { status: 'all' }],
    queryFn: fetchConversations,
    staleTime: 0,
  })

  const handleSelect = useCallback(
    (phone: string) => {
      router.push(`/conversaciones/${phone}`)
    },
    [router]
  )

  const handleItemKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLLIElement>, index: number) => {
      const items = listRef.current?.querySelectorAll<HTMLElement>('[role="option"]')
      if (!items) return
      if (e.key === 'ArrowDown') { e.preventDefault(); items[index + 1]?.focus() }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[index - 1]?.focus() }
    },
    []
  )

  return (
    <section
      aria-label="Lista de conversaciones"
      style={{ borderRight: '1px solid var(--color-border)', overflowY: 'auto', height: '100%' }}
    >
      {!isConnected && <RealtimeDegradationBanner />}

      {isLoading && <ConversationListSkeleton />}

      {isError && (
        <p
          role="alert"
          style={{ padding: '24px 16px', fontSize: 14, color: 'var(--color-text-secondary)', textAlign: 'center' }}
        >
          Error al cargar. Recargá la página.
        </p>
      )}

      {!isLoading && !isError && conversations.length === 0 && (
        <p style={{ padding: '24px 16px', fontSize: 14, color: 'var(--color-text-secondary)', textAlign: 'center' }}>
          No hay conversaciones activas en este momento
        </p>
      )}

      {!isLoading && !isError && conversations.length > 0 && (
        <ul
          ref={listRef}
          role="listbox"
          aria-label="Conversaciones activas"
          style={{ listStyle: 'none', margin: 0, padding: 0 }}
        >
          {conversations.map((conv, index) => (
            <ConversationListItem
              key={conv.id}
              conversation={conv}
              isSelected={selectedPhone === conv.phone_number}
              onSelect={() => handleSelect(conv.phone_number)}
              onKeyDown={(e) => handleItemKeyDown(e, index)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
