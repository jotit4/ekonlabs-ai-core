'use client'

import { useShadowMode } from '@/hooks/use-shadow-mode'
import { useToggleShadowMode } from '@/hooks/use-toggle-shadow-mode'

interface ShadowModeToggleProps {
  initialValue: boolean
}

export function ShadowModeToggle({ initialValue }: ShadowModeToggleProps) {
  const { shadowModeEnabled, isPending: isLoading } = useShadowMode()
  const { toggle, isPending } = useToggleShadowMode()

  const isEnabled = isLoading ? initialValue : shadowModeEnabled

  return (
    <section aria-label="Shadow mode" className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[14px] font-semibold text-[var(--color-text-primary)]">
            Shadow Mode
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
            {isEnabled
              ? 'El agente NO confirma turnos automáticamente'
              : 'El agente confirma turnos automáticamente'}
          </p>
        </div>
        <div
          role="switch"
          aria-checked={isEnabled}
          aria-label="Shadow mode — bloquear agendamiento automático"
          tabIndex={0}
          onClick={() => !isPending && toggle(!isEnabled)}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !isPending) {
              e.preventDefault()
              toggle(!isEnabled)
            }
          }}
          className={[
            'relative inline-flex h-6 w-11 cursor-pointer items-center rounded-full transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)] focus:ring-offset-1',
            isPending ? 'opacity-50 cursor-not-allowed' : '',
            isEnabled ? 'bg-[var(--color-status-alert)]' : 'bg-[var(--color-border)]',
          ].join(' ')}
        >
          <span
            className={[
              'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
              isEnabled ? 'translate-x-6' : 'translate-x-1',
            ].join(' ')}
          />
        </div>
      </div>
      {isEnabled && (
        <p
          role="status"
          aria-live="polite"
          className="text-sm text-[var(--color-status-alert)] bg-[rgba(255,59,48,0.08)] rounded-[8px] px-3 py-2"
        >
          Agendamiento automático bloqueado. Las funciones manuales siguen operativas.
        </p>
      )}
    </section>
  )
}
