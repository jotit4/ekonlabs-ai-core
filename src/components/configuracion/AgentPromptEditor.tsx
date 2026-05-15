'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useAgentConfig } from '@/hooks/use-agent-config'
import { useUpdatePrompt } from '@/hooks/use-update-prompt'
import { SystemPromptOverrideSchema, type SystemPromptOverrideFormValues } from '@/lib/schemas/agente.schema'

export function AgentPromptEditor() {
  const [mounted, setMounted] = useState(false)
  const { config, isPending, isError, refetch } = useAgentConfig()
  const mutation = useUpdatePrompt()

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SystemPromptOverrideFormValues>({
    resolver: standardSchemaResolver(SystemPromptOverrideSchema),
    defaultValues: { system_prompt_override: '' },
  })

  useEffect(() => { setMounted(true) }, [])

  // Sincronizar form con datos cargados
  useEffect(() => {
    if (config) {
      reset({ system_prompt_override: config.system_prompt_override ?? '' })
    }
  }, [config, reset])

  const currentOverride = watch('system_prompt_override')

  const onSubmit = (data: SystemPromptOverrideFormValues) => {
    mutation.mutate(data)
  }

  // Skeleton durante carga (o antes del mount para evitar hydration mismatch)
  if (!mounted || isPending) {
    return (
      <div
        role="status"
        aria-label="Cargando configuración del agente"
        className="space-y-4 animate-pulse"
      >
        <div className="h-32 rounded-[8px] bg-[var(--color-surface)]" />
        <div className="h-24 rounded-[8px] bg-[var(--color-surface)]" />
      </div>
    )
  }

  // Estado de error
  if (isError) {
    return (
      <div
        role="alert"
        className="rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between"
      >
        <p className="text-sm text-red-700">
          Error al cargar la configuración del agente.
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-sm font-medium text-[var(--color-interactive)] hover:underline ml-4"
        >
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <section aria-label="Configuración del prompt del agente" className="space-y-6">
      {/* Formulario de edición */}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div>
          <label
            htmlFor="system_prompt_override"
            className="block text-sm font-medium text-[var(--color-text-primary)] mb-1"
          >
            Override del system prompt
          </label>
          <textarea
            id="system_prompt_override"
            {...register('system_prompt_override')}
            rows={8}
            maxLength={10000}
            className={[
              'w-full px-3 py-2 rounded-[8px] border text-sm resize-vertical min-h-48',
              'bg-[var(--color-bg)] text-[var(--color-text-primary)]',
              'focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]',
              errors.system_prompt_override
                ? 'border-red-400'
                : 'border-[var(--color-border)]',
            ].join(' ')}
            aria-invalid={!!errors.system_prompt_override}
            aria-describedby={errors.system_prompt_override ? 'override-error' : undefined}
            placeholder="Ingresá el override personalizado del system prompt..."
          />
          <p className="text-xs text-[var(--color-text-secondary)] text-right mt-1">
            {currentOverride.length}/10000
          </p>
          {errors.system_prompt_override && (
            <p id="override-error" role="alert" className="mt-1 text-xs text-red-600">
              {errors.system_prompt_override.message}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between">
          <button
            type="submit"
            disabled={isSubmitting || mutation.isPending}
            className={[
              'px-4 py-2 rounded-[8px] text-sm font-medium',
              'bg-[var(--color-interactive)] text-white',
              'hover:opacity-90 transition-opacity min-h-[44px]',
              isSubmitting || mutation.isPending ? 'opacity-50 cursor-not-allowed' : '',
            ].join(' ')}
          >
            {isSubmitting || mutation.isPending ? 'Guardando...' : 'Guardar'}
          </button>
          <a
            href="/configuracion/agente/historial"
            className="text-sm text-[var(--color-interactive)] hover:underline"
          >
            Ver historial de cambios →
          </a>
        </div>
      </form>

      {/* Preview del prompt ensamblado */}
      <div className="space-y-3">
        <h2 className="text-[14px] font-semibold text-[var(--color-text-primary)]">
          Preview del prompt ensamblado
        </h2>

        {/* Sección 1: Base */}
        <div className="rounded-[8px] bg-[var(--color-surface)] border border-[var(--color-border)] p-3">
          <span className="text-[11px] font-semibold uppercase text-[var(--color-text-secondary)] block mb-1">
            Sistema base
          </span>
          <p className="text-sm text-[var(--color-text-secondary)] italic">
            El prompt base está gestionado en el backend de IA y no es editable desde el dashboard.
          </p>
        </div>

        {/* Sección 2: Reglas del tenant */}
        <div className="rounded-[8px] bg-[var(--color-surface)] border border-[var(--color-border)] p-3">
          <span className="text-[11px] font-semibold uppercase text-[var(--color-text-secondary)] block mb-1">
            Reglas del tenant
          </span>
          <pre className="text-sm text-[var(--color-text-secondary)] whitespace-pre-wrap">
            {config && Object.keys(config.rules ?? {}).length > 0
              ? JSON.stringify(config.rules, null, 2)
              : '(sin reglas configuradas)'}
          </pre>
        </div>

        {/* Sección 3: Override personalizado (en tiempo real) */}
        <div className="rounded-[8px] border-2 border-[var(--color-interactive)] p-3">
          <span className="text-[11px] font-semibold uppercase text-[var(--color-interactive)] block mb-1">
            Override personalizado
          </span>
          {currentOverride.trim() ? (
            <pre className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap">
              {currentOverride}
            </pre>
          ) : (
            <p className="text-sm text-[var(--color-text-secondary)] italic">
              (sin override — el agente usa solo el prompt base)
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
