'use client'

import { useResolve } from '@/hooks/use-resolve'
import type { ConversationStatus } from '@/types/conversations'

interface ResolveControlProps {
  phone: string
  conversationStatus: ConversationStatus
}

/**
 * Botón Resolver / Reabrir conversación.
 * Aparece en el panel derecho de [id]/page.tsx — NO en TakeoverBar.
 */
export function ResolveControl({ phone, conversationStatus }: ResolveControlProps) {
  const { resolve, reopen, isPending } = useResolve()

  const isResolved = conversationStatus === 'resolved'

  const handleClick = () => {
    if (isResolved) {
      reopen(phone)
    } else {
      resolve(phone)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-label={isResolved ? 'Reabrir conversación' : 'Resolver conversación'}
      style={{
        width: '100%',
        padding: '8px 12px',
        fontSize: 13,
        fontWeight: 500,
        borderRadius: 8,
        border: '1px solid var(--color-border)',
        backgroundColor: isResolved ? 'var(--color-interactive)' : 'transparent',
        color: isResolved ? '#fff' : 'var(--color-text-secondary)',
        cursor: isPending ? 'default' : 'pointer',
        opacity: isPending ? 0.6 : 1,
        transition: 'background-color 120ms, color 120ms, opacity 120ms',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      {isPending ? 'Guardando…' : isResolved ? 'Reabrir conversación' : 'Marcar como resuelta'}
    </button>
  )
}
