'use client'

import { useRef, useCallback, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ConversationListItem } from '@/components/conversaciones/ConversationListItem'
import { RealtimeDegradationBanner } from '@/components/conversaciones/RealtimeDegradationBanner'
import { useConversationsRealtime } from '@/hooks/use-conversations-realtime'
import type { ConversationSummary } from '@/types/conversations'

type FilterMode = 'all' | 'attention' | 'human_takeover' | 'resolved'

const PAUSED_STATUSES: ConversationSummary['status'][] = ['needs_intervention', 'human_takeover']

// Filtros disponibles en la barra. "attention" agrupa los estados accionables
// (needs_intervention + human_takeover); los demás filtran por un status único.
const FILTERS: { mode: FilterMode; label: string }[] = [
  { mode: 'all', label: 'Todas' },
  { mode: 'attention', label: 'Requiere atención' },
  { mode: 'human_takeover', label: 'En control humano' },
  { mode: 'resolved', label: 'Resueltas' },
]

function matchesFilter(conversation: ConversationSummary, mode: FilterMode): boolean {
  switch (mode) {
    case 'all':
      return true
    case 'attention':
      return PAUSED_STATUSES.includes(conversation.status)
    case 'human_takeover':
      return conversation.status === 'human_takeover'
    case 'resolved':
      return conversation.status === 'resolved'
  }
}

// Búsqueda client-side: normaliza acentos para que "lopez" matchee "López",
// y para teléfonos compara solo dígitos (ignora +, espacios, guiones).
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // elimina marcas diacríticas combinadas
}

function matchesSearch(conversation: ConversationSummary, query: string): boolean {
  const q = normalize(query.trim())
  if (!q) return true
  if (normalize(conversation.patient_name).includes(q)) return true
  // Teléfono: comparar solo dígitos contra los dígitos del query
  const phoneDigits = conversation.phone_number.replace(/\D/g, '')
  const queryDigits = q.replace(/\D/g, '')
  if (queryDigits && phoneDigits.includes(queryDigits)) return true
  return false
}

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

// Error que conserva el status HTTP para que la UI distinga un fallo de permiso
// (403, no reintentable) de uno transitorio (red/500, reintentable).
class ConversationsFetchError extends Error {
  constructor(public readonly status: number) {
    super(`Error al cargar conversaciones (${status})`)
    this.name = 'ConversationsFetchError'
  }
}

async function fetchConversations(): Promise<ConversationSummary[]> {
  const res = await fetch('/api/conversations')
  if (!res.ok) throw new ConversationsFetchError(res.status)
  const json = await res.json() as { conversations: ConversationSummary[] }
  return json.conversations
}

export function ConversationListSidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const listRef = useRef<HTMLUListElement>(null)
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Extrae el phone_number del path: /conversaciones/{phone} — decodificar %2B → +
  const rawSegment = pathname?.match(/\/conversaciones\/([^/]+)/)?.[1] ?? null
  const selectedPhone = rawSegment ? decodeURIComponent(rawSegment) : null

  const { isConnected } = useConversationsRealtime()

  const {
    data: conversations = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<ConversationSummary[]>({
    queryKey: ['conversations', 'list', { status: 'all' }],
    queryFn: fetchConversations,
    staleTime: 0,
    refetchInterval: 30_000, // fallback: si Realtime cae, la lista se actualiza igual cada 30s
    // Un 403 (permiso) no se resuelve reintentando; solo reintentar fallos transitorios.
    retry: (failureCount, err) =>
      !(err instanceof ConversationsFetchError && err.status === 403) && failureCount < 2,
  })

  const isForbidden = error instanceof ConversationsFetchError && error.status === 403

  const attentionCount = conversations.filter((c) =>
    PAUSED_STATUSES.includes(c.status)
  ).length

  const unreadCount = conversations.filter((c) => c.is_unread).length

  // Filtro por estado + búsqueda de texto, ambos client-side sobre lo ya cargado.
  const visibleConversations = conversations.filter(
    (c) => matchesFilter(c, filterMode) && matchesSearch(c, searchQuery)
  )

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
      data-tour="conversation-list"
      style={{ borderRight: '1px solid var(--color-border)', overflowY: 'auto', height: '100%' }}
    >
      {!isConnected && <RealtimeDegradationBanner />}

      {/* Buscador de texto + contador de no leídos */}
      <div
        style={{
          padding: '10px 12px 6px',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <input
          type="search"
          inputMode="search"
          aria-label="Buscar por nombre o teléfono"
          placeholder="Buscar por nombre o teléfono…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '7px 10px',
            fontSize: 13,
            borderRadius: 8,
            border: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-surface)',
            color: 'var(--color-text-primary)',
            outline: 'none',
          }}
        />
        {unreadCount > 0 && (
          <p
            aria-live="polite"
            style={{
              margin: '6px 0 0',
              fontSize: 12,
              color: '#0071e3',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 7,
                height: 7,
                borderRadius: '50%',
                backgroundColor: '#0071e3',
              }}
            />
            {unreadCount} sin leer
          </p>
        )}
      </div>

      {/* Filtro por estado: Todas / Requiere atención / En control humano / Resueltas */}
      <div
        role="group"
        aria-label="Filtrar conversaciones"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          padding: '8px 12px 10px',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        {FILTERS.map(({ mode, label }) => {
          const isActive = filterMode === mode
          const isAttention = mode === 'attention'
          // "Requiere atención" usa naranja; los demás usan el color interactivo del dashboard
          const activeBg = isAttention ? '#ff9f0a' : 'var(--color-interactive)'
          return (
            <button
              key={mode}
              type="button"
              data-tour={isAttention ? 'filter-attention' : undefined}
              aria-pressed={isActive}
              onClick={() => setFilterMode(mode)}
              style={{
                flex: '1 1 calc(50% - 3px)',
                padding: '5px 8px',
                fontSize: 12,
                fontWeight: isActive ? 600 : 400,
                borderRadius: 6,
                border: '1px solid var(--color-border)',
                backgroundColor: isActive ? activeBg : 'transparent',
                color: isActive ? '#fff' : 'var(--color-text-secondary)',
                cursor: 'pointer',
                transition: 'background-color 120ms, color 120ms',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
              }}
            >
              {label}
              {isAttention && attentionCount > 0 && (
                <span
                  aria-label={`${attentionCount} conversaciones requieren atención`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    backgroundColor: isActive ? 'rgba(255,255,255,0.3)' : '#ff9f0a',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 600,
                    padding: '0 4px',
                  }}
                >
                  {attentionCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {isLoading && <ConversationListSkeleton />}

      {isError && (
        <div
          role="alert"
          style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}
        >
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', textAlign: 'center', margin: 0 }}>
            {isForbidden
              ? 'No tenés permiso para ver las conversaciones. Si creés que es un error, avisale al administrador.'
              : 'No pudimos cargar las conversaciones. Revisá tu conexión e intentá de nuevo.'}
          </p>
          {!isForbidden && (
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              style={{
                padding: '7px 16px',
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-interactive)',
                color: '#fff',
                cursor: isFetching ? 'default' : 'pointer',
                opacity: isFetching ? 0.6 : 1,
              }}
            >
              {isFetching ? 'Reintentando…' : 'Reintentar'}
            </button>
          )}
        </div>
      )}

      {!isLoading && !isError && visibleConversations.length === 0 && (
        <p style={{ padding: '24px 16px', fontSize: 14, color: 'var(--color-text-secondary)', textAlign: 'center' }}>
          {searchQuery.trim().length > 0
            ? 'No hay resultados para tu búsqueda'
            : filterMode === 'attention'
              ? 'No hay conversaciones que requieran atención'
              : filterMode === 'human_takeover'
                ? 'No hay conversaciones en control humano'
                : filterMode === 'resolved'
                  ? 'No hay conversaciones resueltas'
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
