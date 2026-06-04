'use client'

import { useShadowMode } from '@/hooks/use-shadow-mode'

export function ShadowModeBanner() {
  const { shadowModeEnabled, isPending, isError } = useShadowMode()

  if (isPending || isError) return null
  if (!shadowModeEnabled) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 rounded-[8px] px-3 py-2 text-sm"
      style={{
        background: 'rgba(255, 159, 10, 0.10)',
        border: '1px solid rgba(255, 159, 10, 0.30)',
        color: 'var(--color-text-primary)',
      }}
    >
      <span aria-hidden="true">⚠</span>
      Shadow mode activo — el agendamiento automático está bloqueado
    </div>
  )
}
