'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useAgentConfig } from '@/hooks/use-agent-config'
import { useUpdateAgentConfig } from '@/hooks/use-update-agent-config'
import {
  ClinicConfigPatchSchema,
  type ClinicConfigPatchFormValues,
} from '@/lib/schemas/agente.schema'
import type { UpdateClinicConfigPayload } from '@/types/agente'

const EMPTY_DEFAULTS: ClinicConfigPatchFormValues = {
  agent_name: '',
  prompt_rules: '',
  ia_config: {
    tone_base: '',
    tone_length: 2,
    identity: '',
    constraints: '',
    features: {
      enable_new_appointment: false,
      enable_cancel: false,
      require_dni: false,
      require_obra_social: false,
    },
  },
  operations_config: {
    min_notice_hours: 0,
    future_window_days: 0,
  },
}

const inputClass =
  'w-full px-3 py-2 rounded-[8px] border border-[var(--color-border)] text-sm bg-[var(--color-bg)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]'

const labelClass = 'block text-sm font-medium text-[var(--color-text-primary)] mb-1'

const sectionTitleClass =
  'text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]'

export function AgentPromptEditor() {
  const [mounted, setMounted] = useState(false)
  const { config, isPending, isError, refetch } = useAgentConfig()
  const mutation = useUpdateAgentConfig()

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ClinicConfigPatchFormValues>({
    resolver: standardSchemaResolver(ClinicConfigPatchSchema),
    defaultValues: EMPTY_DEFAULTS,
  })

  useEffect(() => { setMounted(true) }, [])

  // Sincronizar form con datos cargados (merge sobre defaults para campos ausentes)
  useEffect(() => {
    if (config) {
      reset({
        agent_name: config.agent_name ?? '',
        prompt_rules: config.prompt_rules ?? '',
        ia_config: {
          tone_base: config.ia_config?.tone_base ?? '',
          tone_length: config.ia_config?.tone_length ?? 2,
          identity: config.ia_config?.identity ?? '',
          constraints: config.ia_config?.constraints ?? '',
          features: {
            enable_new_appointment: config.ia_config?.features?.enable_new_appointment ?? false,
            enable_cancel: config.ia_config?.features?.enable_cancel ?? false,
            require_dni: config.ia_config?.features?.require_dni ?? false,
            require_obra_social: config.ia_config?.features?.require_obra_social ?? false,
          },
        },
        operations_config: {
          min_notice_hours: config.operations_config?.min_notice_hours ?? 0,
          future_window_days: config.operations_config?.future_window_days ?? 0,
        },
      })
    }
  }, [config, reset])

  const promptRules = watch('prompt_rules') ?? ''

  const onSubmit = (data: ClinicConfigPatchFormValues) => {
    // Enviar todos los campos del form como payload parcial
    const payload: UpdateClinicConfigPayload = {
      agent_name: data.agent_name,
      prompt_rules: data.prompt_rules,
      ia_config: data.ia_config,
      operations_config: data.operations_config,
    }
    mutation.mutate(payload)
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

  const featureToggle = (
    name:
      | 'ia_config.features.enable_new_appointment'
      | 'ia_config.features.enable_cancel'
      | 'ia_config.features.require_dni'
      | 'ia_config.features.require_obra_social',
    label: string
  ) => (
    <label className="flex items-center gap-3 py-1.5 cursor-pointer">
      <input
        type="checkbox"
        {...register(name)}
        className="h-4 w-4 accent-[var(--color-interactive)]"
      />
      <span className="text-sm text-[var(--color-text-primary)]">{label}</span>
    </label>
  )

  return (
    <section aria-label="Configuración del agente" className="space-y-8">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-8">
        {/* ── Identidad ──────────────────────────────────────────────── */}
        <fieldset className="space-y-4">
          <legend className={sectionTitleClass}>Identidad</legend>

          <div>
            <label htmlFor="agent_name" className={labelClass}>Nombre del agente</label>
            <input
              id="agent_name"
              type="text"
              maxLength={100}
              {...register('agent_name')}
              className={inputClass}
              placeholder="Ej: Asistente de ISADI"
              aria-invalid={!!errors.agent_name}
            />
            {errors.agent_name && (
              <p role="alert" className="mt-1 text-xs text-red-600">{errors.agent_name.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="ia_config.identity" className={labelClass}>Identidad / Personalidad</label>
            <textarea
              id="ia_config.identity"
              rows={3}
              maxLength={2000}
              {...register('ia_config.identity')}
              className={`${inputClass} resize-vertical`}
              placeholder="Cómo se presenta el agente, su rol y personalidad..."
              aria-invalid={!!errors.ia_config?.identity}
            />
            {errors.ia_config?.identity && (
              <p role="alert" className="mt-1 text-xs text-red-600">{errors.ia_config.identity.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="ia_config.constraints" className={labelClass}>Restricciones</label>
            <textarea
              id="ia_config.constraints"
              rows={3}
              maxLength={2000}
              {...register('ia_config.constraints')}
              className={`${inputClass} resize-vertical`}
              placeholder="Qué NO debe hacer el agente..."
              aria-invalid={!!errors.ia_config?.constraints}
            />
            {errors.ia_config?.constraints && (
              <p role="alert" className="mt-1 text-xs text-red-600">{errors.ia_config.constraints.message}</p>
            )}
          </div>
        </fieldset>

        {/* ── Tono ───────────────────────────────────────────────────── */}
        <fieldset className="space-y-4">
          <legend className={sectionTitleClass}>Tono</legend>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="ia_config.tone_base" className={labelClass}>Tono base</label>
              <select
                id="ia_config.tone_base"
                {...register('ia_config.tone_base')}
                className={inputClass}
              >
                <option value="formal">Formal</option>
                <option value="informal">Informal</option>
                <option value="neutro">Neutro</option>
              </select>
            </div>

            <div>
              <label htmlFor="ia_config.tone_length" className={labelClass}>Extensión de respuestas</label>
              <select
                id="ia_config.tone_length"
                {...register('ia_config.tone_length', { valueAsNumber: true })}
                className={inputClass}
              >
                <option value={1}>Corta</option>
                <option value={2}>Media</option>
                <option value={3}>Larga</option>
              </select>
            </div>
          </div>
        </fieldset>

        {/* ── Features ───────────────────────────────────────────────── */}
        <fieldset className="space-y-2">
          <legend className={sectionTitleClass}>Capacidades</legend>
          {featureToggle('ia_config.features.enable_new_appointment', 'Permitir agendar turnos nuevos')}
          {featureToggle('ia_config.features.enable_cancel', 'Permitir cancelar turnos')}
          {featureToggle('ia_config.features.require_dni', 'Requerir DNI para agendar')}
          {featureToggle('ia_config.features.require_obra_social', 'Requerir obra social para agendar')}
        </fieldset>

        {/* ── Operaciones ────────────────────────────────────────────── */}
        <fieldset className="space-y-4">
          <legend className={sectionTitleClass}>Operaciones de agenda</legend>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="operations_config.min_notice_hours" className={labelClass}>
                Anticipación mínima (horas)
              </label>
              <input
                id="operations_config.min_notice_hours"
                type="number"
                min={0}
                {...register('operations_config.min_notice_hours', { valueAsNumber: true })}
                className={inputClass}
                aria-invalid={!!errors.operations_config?.min_notice_hours}
              />
              {errors.operations_config?.min_notice_hours && (
                <p role="alert" className="mt-1 text-xs text-red-600">
                  {errors.operations_config.min_notice_hours.message}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="operations_config.future_window_days" className={labelClass}>
                Ventana futura (días)
              </label>
              <input
                id="operations_config.future_window_days"
                type="number"
                min={0}
                {...register('operations_config.future_window_days', { valueAsNumber: true })}
                className={inputClass}
                aria-invalid={!!errors.operations_config?.future_window_days}
              />
              {errors.operations_config?.future_window_days && (
                <p role="alert" className="mt-1 text-xs text-red-600">
                  {errors.operations_config.future_window_days.message}
                </p>
              )}
            </div>
          </div>
        </fieldset>

        {/* ── Reglas de la Clínica ───────────────────────────────────── */}
        <fieldset className="space-y-2">
          <legend className={sectionTitleClass}>Reglas de la Clínica</legend>
          <label htmlFor="prompt_rules" className={labelClass}>
            Reglas en lenguaje natural (el agente las inyecta como &quot;## Reglas de la Clínica&quot;)
          </label>
          <textarea
            id="prompt_rules"
            rows={8}
            maxLength={10000}
            {...register('prompt_rules')}
            className={`${inputClass} resize-vertical min-h-48`}
            placeholder="Ej: No agendar turnos los feriados. Derivar urgencias al teléfono fijo..."
            aria-invalid={!!errors.prompt_rules}
            aria-describedby={errors.prompt_rules ? 'rules-error' : undefined}
          />
          <p className="text-xs text-[var(--color-text-secondary)] text-right">
            {promptRules.length}/10000
          </p>
          {errors.prompt_rules && (
            <p id="rules-error" role="alert" className="mt-1 text-xs text-red-600">
              {errors.prompt_rules.message}
            </p>
          )}
        </fieldset>

        <div className="flex items-center justify-between">
          <button
            data-tour="agent-save-btn"
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

      {/* ── Preview ──────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-[14px] font-semibold text-[var(--color-text-primary)]">
          Preview del prompt ensamblado
        </h2>

        {/* Sección 1: Sistema base (read-only) */}
        <div className="rounded-[8px] bg-[var(--color-surface)] border border-[var(--color-border)] p-3">
          <span className="text-[11px] font-semibold uppercase text-[var(--color-text-secondary)] block mb-1">
            Sistema base
          </span>
          <p className="text-sm text-[var(--color-text-secondary)] italic">
            El prompt base está gestionado en el backend de IA y no es editable desde el dashboard.
          </p>
        </div>

        {/* Sección 2: Reglas de la Clínica (en vivo) */}
        <div className="rounded-[8px] border-2 border-[var(--color-interactive)] p-3">
          <span className="text-[11px] font-semibold uppercase text-[var(--color-interactive)] block mb-1">
            Reglas de la Clínica
          </span>
          {promptRules.trim() ? (
            <pre className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap">
              {promptRules}
            </pre>
          ) : (
            <p className="text-sm text-[var(--color-text-secondary)] italic">
              (sin reglas — el agente usa sólo el prompt base)
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
