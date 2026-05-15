'use client'

import { useAgentConfig } from '@/hooks/use-agent-config'

export function ShadowModeBanner() {
  const { config, isPending, isError } = useAgentConfig()

  if (isPending || isError) return null
  if (!config?.shadow_mode_enabled) return null

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
