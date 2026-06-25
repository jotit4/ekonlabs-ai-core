'use client'

import { useEffect, useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useAgentConfig } from '@/hooks/use-agent-config'
import { useUpdateAgentConfig } from '@/hooks/use-update-agent-config'
import { KnowledgeBaseManager } from '@/components/configuracion/KnowledgeBaseManager'
import { ShadowModeToggle } from '@/components/configuracion/ShadowModeToggle'
import { Tabs, TabList, TabPanel } from '@/components/ui/tabs'
import {
  ClinicConfigPatchSchema,
  type ClinicConfigPatchFormValues,
} from '@/lib/schemas/agente.schema'
import type { UpdateClinicConfigPayload } from '@/types/agente'
import type { FieldErrors } from 'react-hook-form'

// ── Defaults ──────────────────────────────────────────────────────────────────

const EMPTY_DEFAULTS: ClinicConfigPatchFormValues = {
  agent_name: '',
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

// ── Tabs definition ───────────────────────────────────────────────────────────

const TABS = [
  { id: 'personalidad', label: 'Personalidad' },
  { id: 'capacidades', label: 'Qué puede hacer' },
  { id: 'conocimiento', label: 'Conocimiento' },
  { id: 'avanzado', label: 'Avanzado' },
]

// ── Style helpers ─────────────────────────────────────────────────────────────

const inputClass =
  'w-full px-3 py-2 rounded-[8px] border border-[var(--color-border)] text-sm bg-[var(--color-bg)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]'

const labelClass = 'block text-sm font-medium text-[var(--color-text-primary)] mb-1'

const helpClass = 'mt-1 text-xs text-[var(--color-text-secondary)]'

const sectionTitleClass =
  'text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]'

// ── Props ─────────────────────────────────────────────────────────────────────

interface AgentPromptEditorProps {
  /** Muestra la sección "Confirmación de turnos" (admin-only). */
  isAdmin?: boolean
  /** Valor inicial de shadow_mode_enabled (leído server-side para admin). */
  initialShadowMode?: boolean
  /** Si false, KnowledgeBaseManager se muestra en modo sólo lectura. */
  canEdit?: boolean
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AgentPromptEditor({
  isAdmin = false,
  initialShadowMode = false,
  canEdit = true,
}: AgentPromptEditorProps) {
  const [activeTab, setActiveTab] = useState<string>('personalidad')
  const { config, isPending, isError, refetch } = useAgentConfig()
  const mutation = useUpdateAgentConfig()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ClinicConfigPatchFormValues>({
    resolver: standardSchemaResolver(ClinicConfigPatchSchema),
    defaultValues: EMPTY_DEFAULTS,
  })

  // Sincronizar form con datos cargados
  useEffect(() => {
    if (config) {
      reset({
        agent_name: config.agent_name ?? '',
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

  // Navegar a la pestaña que contiene el primer error de validación
  const onInvalid = useCallback((formErrors: FieldErrors<ClinicConfigPatchFormValues>) => {
    if (
      formErrors.agent_name ||
      formErrors.ia_config?.identity ||
      formErrors.ia_config?.constraints ||
      formErrors.ia_config?.tone_base ||
      formErrors.ia_config?.tone_length
    ) {
      setActiveTab('personalidad')
    } else if (formErrors.ia_config?.features) {
      setActiveTab('capacidades')
    } else if (formErrors.operations_config) {
      setActiveTab('avanzado')
    }
  }, [])

  const onSubmit = (data: ClinicConfigPatchFormValues) => {
    // `prompt_rules` NO se edita desde el dashboard (se gestiona en el repo/DB).
    // Se omite del payload: el PATCH hace merge no destructivo y preserva el valor.
    const payload: UpdateClinicConfigPayload = {
      agent_name: data.agent_name,
      ia_config: data.ia_config,
      operations_config: data.operations_config,
    }
    mutation.mutate(payload)
  }

  // Helper para checkboxes de capacidades
  const featureToggle = (
    name:
      | 'ia_config.features.enable_new_appointment'
      | 'ia_config.features.enable_cancel'
      | 'ia_config.features.require_dni'
      | 'ia_config.features.require_obra_social',
    label: string,
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

  // ── Skeleton ────────────────────────────────────────────────────────────────
  if (isPending) {
    return (
      <div
        role="status"
        aria-label="Cargando configuración del agente"
        className="space-y-4 animate-pulse"
      >
        <div className="h-10 rounded-[8px] bg-[var(--color-surface)]" />
        <div className="h-32 rounded-[8px] bg-[var(--color-surface)]" />
        <div className="h-24 rounded-[8px] bg-[var(--color-surface)]" />
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div
        role="alert"
        className="rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between"
      >
        <p className="text-sm text-red-700">Error al cargar la configuración del agente.</p>
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

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <section aria-label="Configuración del agente">
      <Tabs
        defaultTab="personalidad"
        activeTab={activeTab}
        onTabChange={setActiveTab}
        className="space-y-0"
      >
        {/* ── Tab list ─────────────────────────────────────────────────────── */}
        <TabList tabs={TABS} className="mb-0" />

        {/* ── Form del agente: pestañas Personalidad, Qué puede hacer y Avanzado ──
             La pestaña Conocimiento queda FUERA de este form (tiene su propio
             <form> interno; un <form> no puede anidarse dentro de otro). ── */}
        <form
          onSubmit={handleSubmit(onSubmit, onInvalid)}
          noValidate
          className="relative"
        >
          {/* ── Tab 1: Personalidad ──────────────────────────────────────── */}
          <TabPanel id="personalidad" className="space-y-6 pt-6">
            <div className="space-y-4">
              <p className={sectionTitleClass}>Cómo se presenta y habla el agente</p>

              {/* Nombre del agente */}
              <div>
                <label htmlFor="agent_name" className={labelClass}>
                  Nombre del agente
                </label>
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
                  <p role="alert" className="mt-1 text-xs text-red-600">
                    {errors.agent_name.message}
                  </p>
                )}
              </div>

              {/* Identidad / Personalidad */}
              <div>
                <label htmlFor="ia_config.identity" className={labelClass}>
                  Identidad / Personalidad
                </label>
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
                  <p role="alert" className="mt-1 text-xs text-red-600">
                    {errors.ia_config.identity.message}
                  </p>
                )}
              </div>

              {/* Qué debe evitar */}
              <div>
                <label htmlFor="ia_config.constraints" className={labelClass}>
                  Qué debe evitar
                </label>
                <textarea
                  id="ia_config.constraints"
                  rows={3}
                  maxLength={2000}
                  {...register('ia_config.constraints')}
                  className={`${inputClass} resize-vertical`}
                  placeholder="Ej: No dar diagnósticos médicos. No compartir datos de otros pacientes..."
                  aria-invalid={!!errors.ia_config?.constraints}
                />
                <p className={helpClass}>
                  Temas o acciones que el agente debe rechazar o ignorar.
                </p>
                {errors.ia_config?.constraints && (
                  <p role="alert" className="mt-1 text-xs text-red-600">
                    {errors.ia_config.constraints.message}
                  </p>
                )}
              </div>

              {/* Tono */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="ia_config.tone_base" className={labelClass}>
                    Tono base
                  </label>
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
                  <label htmlFor="ia_config.tone_length" className={labelClass}>
                    Extensión de respuestas
                  </label>
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
            </div>
          </TabPanel>

          {/* ── Tab 2: Qué puede hacer ───────────────────────────────────── */}
          <TabPanel id="capacidades" className="space-y-6 pt-6">
            {/* Capacidades */}
            <fieldset className="space-y-2">
              <legend className={sectionTitleClass}>Capacidades</legend>
              <p className={helpClass + ' mb-2'}>
                Aplica al agente de WhatsApp de tu clínica.
              </p>
              {featureToggle(
                'ia_config.features.enable_new_appointment',
                'Permitir agendar turnos nuevos',
              )}
              {featureToggle('ia_config.features.enable_cancel', 'Permitir cancelar turnos')}
              {featureToggle('ia_config.features.require_dni', 'Requerir DNI para agendar')}
              {featureToggle(
                'ia_config.features.require_obra_social',
                'Requerir obra social para agendar',
              )}
            </fieldset>
          </TabPanel>

          {/* ── Tab 4: Avanzado ──────────────────────────────────────────── */}
          <TabPanel id="avanzado" className="space-y-6 pt-6">
            {/* Operaciones de agenda */}
            <fieldset className="space-y-4">
              <legend className={sectionTitleClass}>Operaciones de agenda</legend>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="operations_config.min_notice_hours" className={labelClass}>
                    Anticipación mínima para reservar
                  </label>
                  <input
                    id="operations_config.min_notice_hours"
                    type="number"
                    min={0}
                    {...register('operations_config.min_notice_hours', { valueAsNumber: true })}
                    className={inputClass}
                    aria-invalid={!!errors.operations_config?.min_notice_hours}
                  />
                  <p className={helpClass}>
                    Horas mínimas de anticipación. Ej: 2 = no se reservan turnos para
                    dentro de menos de 2 horas.
                  </p>
                  {errors.operations_config?.min_notice_hours && (
                    <p role="alert" className="mt-1 text-xs text-red-600">
                      {errors.operations_config.min_notice_hours.message}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="operations_config.future_window_days" className={labelClass}>
                    Hasta cuándo se puede reservar
                  </label>
                  <input
                    id="operations_config.future_window_days"
                    type="number"
                    min={0}
                    {...register('operations_config.future_window_days', { valueAsNumber: true })}
                    className={inputClass}
                    aria-invalid={!!errors.operations_config?.future_window_days}
                  />
                  <p className={helpClass}>
                    Días hacia adelante que puede ofrecer el agente. Ej: 30 = hasta un mes.
                  </p>
                  {errors.operations_config?.future_window_days && (
                    <p role="alert" className="mt-1 text-xs text-red-600">
                      {errors.operations_config.future_window_days.message}
                    </p>
                  )}
                </div>
              </div>
            </fieldset>

            {/* Confirmación de turnos — admin only */}
            {isAdmin && (
              <>
                <hr className="border-[var(--color-border)]" />
                <ShadowModeToggle initialValue={initialShadowMode} />
              </>
            )}
          </TabPanel>

          {/* ── Barra de acción global (solo en pestañas del form del agente) ── */}
          {activeTab !== 'conocimiento' && (
            <div className="mt-8 flex items-center justify-between pt-4 border-t border-[var(--color-border)]">
              <button
                data-tour="agent-save-btn"
                type="submit"
                disabled={isSubmitting || mutation.isPending}
                className={[
                  'px-5 py-2 rounded-[8px] text-sm font-medium',
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
          )}
        </form>

        {/* ── Tab 3: Conocimiento — FUERA del <form> del agente ─────────────
             Tiene su propio <form> interno; no puede vivir dentro de otro form. ── */}
        <TabPanel id="conocimiento" className="pt-6">
          <KnowledgeBaseManager canEdit={canEdit} />
        </TabPanel>
      </Tabs>
    </section>
  )
}
