'use client'

import { useShadowMode } from '@/hooks/use-shadow-mode'
import { useToggleShadowMode } from '@/hooks/use-toggle-shadow-mode'

interface ShadowModeToggleProps {
  initialValue: boolean
}

/**
 * "Confirmación de turnos" — admin-only control.
 *
 * Mapeo exacto (NO invertir):
 *   - shadow_mode_enabled = false → opción "Automática"
 *   - shadow_mode_enabled = true  → opción "Manual"
 *
 * El nombre del campo/hook y el payload (shadow_mode_enabled) no cambian.
 */
export function ShadowModeToggle({ initialValue }: ShadowModeToggleProps) {
  const { shadowModeEnabled, isPending: isLoading } = useShadowMode()
  const { toggle, isPending } = useToggleShadowMode()

  const isManual = isLoading ? initialValue : shadowModeEnabled

  return (
    <section
      aria-label="Confirmación de turnos"
      data-tour="shadow-mode-toggle"
      className="space-y-4"
    >
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          Confirmación de turnos
        </h3>
        <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
          Cómo gestiona el agente las reservas recibidas por WhatsApp.
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="Modo de confirmación de turnos"
        className="grid grid-cols-1 sm:grid-cols-2 gap-3"
      >
        {/* Opción Automática: shadow_mode_enabled = false */}
        <label
          className={[
            'flex items-start gap-3 p-4 rounded-[8px] border cursor-pointer transition-colors',
            isPending ? 'opacity-50 cursor-not-allowed' : '',
            !isManual
              ? 'border-[var(--color-interactive)]'
              : 'border-[var(--color-border)] hover:border-[var(--color-text-secondary)]',
          ].join(' ')}
        >
          <input
            type="radio"
            name="confirmacion-turnos"
            value="automatica"
            checked={!isManual}
            onChange={() => !isPending && toggle(false)}
            disabled={isPending}
            className="mt-0.5 accent-[var(--color-interactive)]"
            aria-label="Automática"
          />
          <div>
            <span className="block text-sm font-semibold text-[var(--color-text-primary)]">
              Automática
            </span>
            <span className="block text-xs text-[var(--color-text-secondary)] mt-0.5">
              El agente confirma los turnos al instante.
            </span>
          </div>
        </label>

        {/* Opción Manual: shadow_mode_enabled = true */}
        <label
          className={[
            'flex items-start gap-3 p-4 rounded-[8px] border cursor-pointer transition-colors',
            isPending ? 'opacity-50 cursor-not-allowed' : '',
            isManual
              ? 'border-[var(--color-interactive)]'
              : 'border-[var(--color-border)] hover:border-[var(--color-text-secondary)]',
          ].join(' ')}
        >
          <input
            type="radio"
            name="confirmacion-turnos"
            value="manual"
            checked={isManual}
            onChange={() => !isPending && toggle(true)}
            disabled={isPending}
            className="mt-0.5 accent-[var(--color-interactive)]"
            aria-label="Manual"
          />
          <div>
            <span className="block text-sm font-semibold text-[var(--color-text-primary)]">
              Manual
            </span>
            <span className="block text-xs text-[var(--color-text-secondary)] mt-0.5">
              El agente toma el turno pero tu equipo lo confirma. Los turnos quedan
              pendientes hasta que recepción apruebe.
            </span>
          </div>
        </label>
      </div>

      {isManual && (
        <p
          role="status"
          aria-live="polite"
          className="text-sm text-[var(--color-status-alert)] bg-[rgba(255,59,48,0.08)] rounded-[8px] px-3 py-2"
        >
          Los turnos nuevos quedan pendientes de confirmación por recepción.
        </p>
      )}
    </section>
  )
}
