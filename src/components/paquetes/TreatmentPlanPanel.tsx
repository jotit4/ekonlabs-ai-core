'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCurrentTenant } from '@/hooks/use-current-tenant'
import {
  treatmentPlanInputSchema,
  type TreatmentPlanFormValues,
} from '@/lib/schemas/treatment-plan.schema'
import type { TreatmentPlan } from '@/types/treatments'

interface TreatmentPlanPanelProps {
  treatmentId: string
}

/**
 * Plan de tratamiento 1:1 con el paquete (Story 14.2 — Epic 14 HCE).
 *
 * AUTO-GATEADO POR ROL: HCE (Ley 25.326) → SOLO doctor/admin. Para receptionist
 * (o mientras carga el rol) devuelve null: ni botón ni sección. PaquetesTracking
 * lo monta sin lógica de rol propia.
 *
 * Colapsado por defecto; al expandir carga el plan vía GET /api/treatments/[id]/plan
 * (API Route — el guard 403 vive en el server; la RLS 040 es la segunda capa).
 * Guardado EXPLÍCITO con botón (PUT = upsert) — el autosave es patrón de 14.3, no acá.
 */
export function TreatmentPlanPanel({ treatmentId }: TreatmentPlanPanelProps) {
  const { role, loading } = useCurrentTenant()

  // Gate de rol ANTES de montar el contenido (componente aparte para no
  // condicionar hooks): receptionist / rol desconocido / cargando → nada.
  if (loading || !['doctor', 'admin'].includes(role ?? '')) return null

  return <TreatmentPlanPanelContent treatmentId={treatmentId} />
}

function TreatmentPlanPanelContent({ treatmentId }: TreatmentPlanPanelProps) {
  const [expanded, setExpanded] = useState(false)

  const { data, isPending, isError } = useQuery<{ plan: TreatmentPlan | null }>({
    queryKey: ['treatment-plan', treatmentId],
    queryFn: async () => {
      const res = await fetch(`/api/treatments/${treatmentId}/plan`)
      if (!res.ok) throw new Error('Error al cargar el plan')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
    enabled: expanded,
  })

  return (
    <div className="mt-3 border-t border-[var(--color-border)] pt-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex min-h-[44px] items-center gap-1 text-xs font-medium text-[var(--color-interactive)] hover:underline"
      >
        <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
        Plan de tratamiento
      </button>

      {expanded && (
        <div className="mt-2">
          {isPending && (
            <div role="status" aria-label="Cargando plan de tratamiento">
              <div className="h-24 animate-pulse rounded bg-[#f5f5f7]" />
            </div>
          )}

          {isError && (
            <p role="alert" className="text-xs text-[var(--color-text-secondary)]">
              No se pudo cargar el plan de tratamiento. Intentá de nuevo más tarde.
            </p>
          )}

          {!isPending && !isError && data && (
            <TreatmentPlanForm treatmentId={treatmentId} plan={data.plan} />
          )}
        </div>
      )}
    </div>
  )
}

interface TreatmentPlanFormProps {
  treatmentId: string
  plan: TreatmentPlan | null
}

function TreatmentPlanForm({ treatmentId, plan }: TreatmentPlanFormProps) {
  const queryClient = useQueryClient()
  const [saved, setSaved] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TreatmentPlanFormValues>({
    resolver: standardSchemaResolver(treatmentPlanInputSchema),
    // Plan inexistente (plan: null) → formulario vacío listo para crear.
    defaultValues: {
      motivo_consulta: plan?.motivo_consulta ?? '',
      objetivo: plan?.objetivo ?? '',
      cie10_code: plan?.cie10_code ?? '',
      indicated_sessions: plan?.indicated_sessions ?? null,
    },
  })

  const mutation = useMutation({
    mutationFn: async (values: TreatmentPlanFormValues) => {
      const res = await fetch(`/api/treatments/${treatmentId}/plan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (!res.ok) throw new Error('Error al guardar el plan')
      return res.json() as Promise<{ plan: TreatmentPlan }>
    },
    onSuccess: () => {
      setSaved(true)
      queryClient.invalidateQueries({ queryKey: ['treatment-plan', treatmentId] })
    },
  })

  const onSubmit = (values: TreatmentPlanFormValues) => {
    setSaved(false)
    mutation.mutate(values)
  }

  const inputClass =
    'w-full rounded-[6px] border border-[var(--color-border)] px-2 py-1.5 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-interactive)]'

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3">
      <div>
        <label
          htmlFor={`plan-motivo-${treatmentId}`}
          className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]"
        >
          Motivo de consulta / diagnóstico
        </label>
        <textarea
          id={`plan-motivo-${treatmentId}`}
          rows={2}
          {...register('motivo_consulta')}
          className={inputClass}
        />
      </div>

      <div>
        <label
          htmlFor={`plan-objetivo-${treatmentId}`}
          className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]"
        >
          Objetivo del tratamiento
        </label>
        <textarea
          id={`plan-objetivo-${treatmentId}`}
          rows={2}
          {...register('objetivo')}
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            htmlFor={`plan-cie10-${treatmentId}`}
            className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]"
          >
            Código CIE-10 (opcional)
          </label>
          <input
            id={`plan-cie10-${treatmentId}`}
            type="text"
            placeholder="Ej: M54.5"
            {...register('cie10_code')}
            className={inputClass}
          />
          <p className="mt-1 text-[10px] text-[var(--color-text-secondary)]">
            Formato: letra + 2 dígitos (+ subcategoría). Ej: M54.5
          </p>
          {errors.cie10_code && (
            <p role="alert" className="mt-1 text-[10px] text-red-600">
              {errors.cie10_code.message}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor={`plan-sesiones-${treatmentId}`}
            className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]"
          >
            Sesiones indicadas (opcional)
          </label>
          <input
            id={`plan-sesiones-${treatmentId}`}
            type="number"
            min={1}
            step={1}
            {...register('indicated_sessions', {
              setValueAs: (v) =>
                v === '' || v === null || Number.isNaN(Number(v)) ? null : Number(v),
            })}
            className={inputClass}
          />
          {errors.indicated_sessions && (
            <p role="alert" className="mt-1 text-[10px] text-red-600">
              {errors.indicated_sessions.message}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="min-h-[44px] rounded-[6px] bg-[var(--color-interactive)] px-4 text-xs font-medium text-white disabled:opacity-50"
        >
          {mutation.isPending ? 'Guardando…' : 'Guardar plan'}
        </button>
        {saved && !mutation.isPending && (
          <span role="status" className="text-xs text-green-700">
            Plan guardado
          </span>
        )}
        {mutation.isError && (
          <span role="alert" className="text-xs text-red-600">
            No se pudo guardar el plan. Intentá de nuevo.
          </span>
        )}
      </div>
    </form>
  )
}
