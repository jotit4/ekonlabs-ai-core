'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO, isValid } from 'date-fns'
import { es } from 'date-fns/locale'
import { useCurrentTenant } from '@/hooks/use-current-tenant'
import {
  treatmentPlanInputSchema,
  type TreatmentPlanFormValues,
} from '@/lib/schemas/treatment-plan.schema'
import type { TreatmentPlan } from '@/types/treatments'

interface TreatmentPlanPanelProps {
  treatmentId: string
  /** Sesiones restantes del paquete — la confirmación del alta advierte si > 0 (Story 14.6). */
  sessionsRemaining: number
}

/**
 * Plan de tratamiento 1:1 con el paquete (Story 14.2 — Epic 14 HCE)
 * + alta / informe final (Story 14.6).
 *
 * AUTO-GATEADO POR ROL: HCE (Ley 25.326) → doctor/admin/receptionist. Mientras
 * carga el rol (o para cualquier otro rol) devuelve null: ni botón ni sección.
 * PaquetesTracking lo monta sin lógica de rol propia.
 *
 * Colapsado por defecto; al expandir carga el plan vía GET /api/treatments/[id]/plan
 * (API Route — el guard 403 vive en el server; la RLS 040 es la segunda capa).
 *
 * Tres estados según el plan (Story 14.6):
 * - `plan === null` → solo el form de creación de 14.2 (sin sección de alta:
 *   el server respondería 409 "registrá el plan antes").
 * - plan sin alta → form de edición + sección "Alta / informe final" con
 *   confirmación inline en dos pasos (advierte si quedan sesiones restantes).
 * - `plan.discharge_at != null` → SOLO LECTURA: campos como texto + informe
 *   final + fecha del alta (el PUT del server también responde 409).
 */
export function TreatmentPlanPanel({ treatmentId, sessionsRemaining }: TreatmentPlanPanelProps) {
  const { role, loading } = useCurrentTenant()

  // Gate de rol ANTES de montar el contenido (componente aparte para no
  // condicionar hooks): rol desconocido / cargando → nada.
  if (loading || !['doctor', 'admin', 'receptionist'].includes(role ?? '')) return null

  return (
    <TreatmentPlanPanelContent treatmentId={treatmentId} sessionsRemaining={sessionsRemaining} />
  )
}

function TreatmentPlanPanelContent({ treatmentId, sessionsRemaining }: TreatmentPlanPanelProps) {
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
            data.plan?.discharge_at != null ? (
              <TreatmentPlanReadOnly plan={data.plan} />
            ) : (
              <>
                <TreatmentPlanForm treatmentId={treatmentId} plan={data.plan} />
                {/* Sección de alta SOLO con plan registrado (sin plan el server
                    devolvería 409 — la UI ni la ofrece). */}
                {data.plan !== null && (
                  <DischargeSection
                    treatmentId={treatmentId}
                    sessionsRemaining={sessionsRemaining}
                  />
                )}
              </>
            )
          )}
        </div>
      )}
    </div>
  )
}

// Fecha es-AR con guarda de invalidez (mismo criterio que fmtDate de PaquetesTracking).
function fmtFechaAlta(iso: string): string {
  const parsed = parseISO(iso)
  if (!isValid(parsed)) return '—'
  return format(parsed, "d 'de' MMMM 'de' yyyy", { locale: es })
}

// ─── Branch SOLO LECTURA post-alta (Story 14.6) ────────────────────────────────
function TreatmentPlanReadOnly({ plan }: { plan: TreatmentPlan }) {
  const fields: Array<{ label: string; value: string }> = [
    { label: 'Motivo de consulta / diagnóstico', value: plan.motivo_consulta ?? '—' },
    { label: 'Objetivo del tratamiento', value: plan.objetivo ?? '—' },
    { label: 'Código CIE-10', value: plan.cie10_code ?? '—' },
    {
      label: 'Sesiones indicadas',
      value: plan.indicated_sessions != null ? String(plan.indicated_sessions) : '—',
    },
  ]

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-[var(--color-text-secondary)]">
        {fields.map((f) => (
          <div key={f.label} className="contents">
            <dt>{f.label}</dt>
            <dd className="text-[var(--color-text-primary)]">{f.value}</dd>
          </div>
        ))}
      </dl>

      <div className="rounded-[6px] border border-[var(--color-border)] bg-[#f5f5f7] p-3">
        <p className="mb-1 text-xs font-medium text-[var(--color-text-secondary)]">
          Informe final
        </p>
        <p className="whitespace-pre-wrap text-xs text-[var(--color-text-primary)]">
          {plan.discharge_report ?? '—'}
        </p>
        <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
          Alta: {plan.discharge_at ? fmtFechaAlta(plan.discharge_at) : '—'}
        </p>
      </div>
    </div>
  )
}

// ─── Sección "Alta / informe final" (Story 14.6) ───────────────────────────────
// Confirmación INLINE en dos pasos (NO window.confirm): "Dar el alta…" abre el
// bloque de confirmación, que advierte si quedan sesiones restantes pero permite
// confirmar igual (decisión clínica — AC del epic).
interface DischargeSectionProps {
  treatmentId: string
  sessionsRemaining: number
}

function DischargeSection({ treatmentId, sessionsRemaining }: DischargeSectionProps) {
  const queryClient = useQueryClient()
  const [report, setReport] = useState('')
  const [confirming, setConfirming] = useState(false)

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/treatments/${treatmentId}/discharge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discharge_report: report }),
      })
      if (!res.ok) {
        let message = 'No se pudo dar el alta. Intentá de nuevo.'
        try {
          const data = await res.json()
          if (typeof data?.error === 'string' && data.error) message = data.error
        } catch {
          // sin body JSON → mensaje genérico
        }
        throw new Error(message)
      }
      return res.json() as Promise<{ plan: TreatmentPlan }>
    },
    onSuccess: () => {
      setConfirming(false)
      // Doble invalidación: el plan (re-render read-only con el informe) y el
      // tracking de paquetes (key parcial → la card pasa a "Completado" gratis
      // vía TREATMENT_STATUS_LABELS).
      queryClient.invalidateQueries({ queryKey: ['treatment-plan', treatmentId] })
      queryClient.invalidateQueries({ queryKey: ['treatments', 'by-patient'] })
    },
  })

  return (
    <div className="mt-4 border-t border-[var(--color-border)] pt-3">
      <p className="mb-1 text-xs font-medium text-[var(--color-text-secondary)]">
        Alta / informe final
      </p>

      <label htmlFor={`discharge-report-${treatmentId}`} className="sr-only">
        Informe final del tratamiento
      </label>
      <textarea
        id={`discharge-report-${treatmentId}`}
        rows={3}
        value={report}
        onChange={(e) => setReport(e.target.value)}
        disabled={mutation.isPending}
        placeholder="Informe final del tratamiento (obligatorio para dar el alta)"
        className="w-full rounded-[6px] border border-[var(--color-border)] px-2 py-1.5 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-interactive)]"
      />

      {!confirming && (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={report.trim().length === 0 || mutation.isPending}
          className="mt-2 min-h-[44px] rounded-[6px] border border-[var(--color-border)] px-4 text-xs font-medium text-[var(--color-text-primary)] disabled:opacity-50"
        >
          Dar el alta…
        </button>
      )}

      {confirming && (
        <div
          role="alertdialog"
          aria-label="Confirmar alta del tratamiento"
          className="mt-2 space-y-2 rounded-[6px] border border-[var(--color-border)] bg-[#fff8f0] p-3"
        >
          <p className="text-xs text-[var(--color-text-primary)]">
            El alta cierra la historia clínica del paquete y marca el tratamiento como
            completado. Esta acción no se puede deshacer.
          </p>
          {sessionsRemaining > 0 && (
            <p className="text-xs font-medium text-amber-700">
              Quedan {sessionsRemaining} sesiones restantes en el paquete.
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="min-h-[44px] rounded-[6px] bg-[var(--color-interactive)] px-4 text-xs font-medium text-white disabled:opacity-50"
            >
              {mutation.isPending ? 'Dando el alta…' : 'Confirmar alta'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={mutation.isPending}
              className="min-h-[44px] rounded-[6px] border border-[var(--color-border)] px-4 text-xs font-medium text-[var(--color-text-primary)] disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {mutation.isError && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {mutation.error instanceof Error
            ? mutation.error.message
            : 'No se pudo dar el alta. Intentá de nuevo.'}
        </p>
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
