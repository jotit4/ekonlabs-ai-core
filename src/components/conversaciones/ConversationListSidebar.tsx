'use client'

import { useRef, useCallback, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ConversationListItem } from '@/components/conversaciones/ConversationListItem'
import { RealtimeDegradationBanner } from '@/components/conversaciones/RealtimeDegradationBanner'
import { useConversationsRealtime } from '@/hooks/use-conversations-realtime'
import type { ConversationSummary } from '@/types/conversations'

type FilterMode = 'all' | 'attention'

const PAUSED_STATUSES: ConversationSummary['status'][] = ['needs_intervention', 'human_takeover']

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
  const [filterMode, setFilterMode] = useState<FilterMode>('all')

  // Extrae el phone_number del path: /conversaciones/{phone} — decodificar %2B → +
  const rawSegment = pathname?.match(/\/conversaciones\/([^/]+)/)?.[1] ?? null
  const selectedPhone = rawSegment ? decodeURIComponent(rawSegment) : null

  const { isConnected } = useConversationsRealtime()

  const { data: conversations = [], isLoading, isError } = useQuery<ConversationSummary[]>({
    queryKey: ['conversations', 'list', { status: 'all' }],
    queryFn: fetchConversations,
    staleTime: 0,
    refetchInterval: 30_000, // fallback: si Realtime cae, la lista se actualiza igual cada 30s
  })

  const attentionCount = conversations.filter((c) =>
    PAUSED_STATUSES.includes(c.status)
  ).length

  const visibleConversations =
    filterMode === 'attention'
      ? conversations.filter((c) => PAUSED_STATUSES.includes(c.status))
      : conversations

  const handleSelect = useCallback(
    (phone: string) => {
      router.push(`/conversaciones/${encodeURIComponent(phone)}`)
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

      {/* Filtro toggle: Todas / Requiere atención */}
      <div
        role="group"
        aria-label="Filtrar conversaciones"
        style={{
          display: 'flex',
          gap: 6,
          padding: '10px 12px',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <button
          type="button"
          aria-pressed={filterMode === 'all'}
          onClick={() => setFilterMode('all')}
          style={{
            flex: 1,
            padding: '5px 8px',
            fontSize: 12,
            fontWeight: filterMode === 'all' ? 600 : 400,
            borderRadius: 6,
            border: '1px solid var(--color-border)',
            backgroundColor: filterMode === 'all' ? 'var(--color-interactive)' : 'transparent',
            color: filterMode === 'all' ? '#fff' : 'var(--color-text-secondary)',
            cursor: 'pointer',
            transition: 'background-color 120ms, color 120ms',
          }}
        >
          Todas
        </button>
        <button
          type="button"
          aria-pressed={filterMode === 'attention'}
          onClick={() => setFilterMode('attention')}
          style={{
            flex: 1,
            padding: '5px 8px',
            fontSize: 12,
            fontWeight: filterMode === 'attention' ? 600 : 400,
            borderRadius: 6,
            border: '1px solid var(--color-border)',
            backgroundColor: filterMode === 'attention' ? '#ff9f0a' : 'transparent',
            color: filterMode === 'attention' ? '#fff' : 'var(--color-text-secondary)',
            cursor: 'pointer',
            transition: 'background-color 120ms, color 120ms',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
          }}
        >
          Requiere atención
          {attentionCount > 0 && (
            <span
              aria-label={`${attentionCount} conversaciones requieren atención`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 16,
                height: 16,
                borderRadius: 8,
                backgroundColor: filterMode === 'attention' ? 'rgba(255,255,255,0.3)' : '#ff9f0a',
                color: filterMode === 'attention' ? '#fff' : '#fff',
                fontSize: 10,
                fontWeight: 600,
                padding: '0 4px',
              }}
            >
              {attentionCount}
            </span>
          )}
        </button>
      </div>

      {isLoading && <ConversationListSkeleton />}

      {isError && (
        <p
          role="alert"
          style={{ padding: '24px 16px', fontSize: 14, color: 'var(--color-text-secondary)', textAlign: 'center' }}
        >
          Error al cargar. Recargá la página.
        </p>
      )}

      {!isLoading && !isError && visibleConversations.length === 0 && (
        <p style={{ padding: '24px 16px', fontSize: 14, color: 'var(--color-text-secondary)', textAlign: 'center' }}>
          {filterMode === 'attention'
            ? 'No hay conversaciones que requieran atención'
            : 'No hay conversaciones activas en este momento'}
        </p>
      )}

      {!isLoading && !isError && visibleConversations.length > 0 && (
        <ul
          ref={listRef}
          role="listbox"
          aria-label="Conversaciones activas"
          style={{ listStyle: 'none', margin: 0, padding: 0 }}
        >
          {visibleConversations.map((conv, index) => (
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
