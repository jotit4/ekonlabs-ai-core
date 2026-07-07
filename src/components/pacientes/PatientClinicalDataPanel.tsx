'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCurrentTenant } from '@/hooks/use-current-tenant'
import type { PatientClinicalData } from '@/types/patients'

interface PatientClinicalDataPanelProps {
  patientId: string
  readOnly?: boolean
}

/**
 * Contexto clínico de base del paciente: antecedentes, alergias, medicación y
 * cirugías (Story 14.4 — Epic 14 HCE; `cirugias` sumado en la digitalización de
 * la ficha de admisión — migración 047, mismo tratamiento sellado).
 *
 * AUTO-GATEADO POR ROL: HCE (Ley 25.326) → doctor/admin/receptionist. Mientras
 * carga el rol (o para cualquier otro rol) devuelve null: ni toggle ni sección
 * ni fetch. El host (tab "Notas clínicas" de la ficha) ya está gateado a
 * doctor/admin/receptionist a nivel tab — este gate interno es la segunda capa
 * de defensa.
 *
 * ⚠️ A diferencia de 14.2/14.3 acá NO hay red de RLS por rol (los campos viven en
 * `patients`): la privacidad es 100% capa de aplicación (guard 403 del endpoint
 * dedicado + este gate + sellado de read paths por select explícito).
 *
 * Colapsado por defecto; al expandir carga vía GET /api/patients/[id]/clinical-data.
 * Autosave con debounce 1200ms (molde SessionNotePanel POST-patches del review 14.3,
 * SIN react-hook-form) portando desde el día 1 los 3 patrones:
 *  (a) lastSavedRef actualizado tras cada PUT exitoso (el revert al texto guardado
 *      también se persiste),
 *  (b) setQueryData con la respuesta del PUT — NUNCA invalidate/refetch que pise
 *      el tipeo,
 *  (c) saveSeqRef para descartar respuestas de PUTs fuera de orden.
 *
 * readOnly (eliminación pendiente del paciente): textareas disabled, sin autosave —
 * el médico puede CONSULTAR alergias de un paciente en gracia de eliminación.
 *
 * ⚠️ DEPENDENCIA DE RUNTIME: requiere la migración 042 APLICADA (la aplica el
 * usuario en EasyPanel). Sin ella el GET devuelve 500 → mensaje de error sin crash.
 */
export function PatientClinicalDataPanel({ patientId, readOnly = false }: PatientClinicalDataPanelProps) {
  const { role, loading } = useCurrentTenant()

  // Gate de rol ANTES de montar el contenido (componente aparte para no
  // condicionar hooks): rol desconocido / cargando → nada.
  if (loading || !['doctor', 'admin', 'receptionist'].includes(role ?? '')) return null

  return <PatientClinicalDataPanelContent patientId={patientId} readOnly={readOnly} />
}

function PatientClinicalDataPanelContent({ patientId, readOnly }: PatientClinicalDataPanelProps) {
  const [expanded, setExpanded] = useState(false)

  const { data, isPending, isError } = useQuery<{ clinical_data: PatientClinicalData }>({
    queryKey: ['patient-clinical-data', patientId],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${patientId}/clinical-data`)
      if (!res.ok) throw new Error('Error al cargar los datos clínicos')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
    enabled: expanded,
  })

  return (
    <div className="mb-6 rounded-[8px] border border-[var(--color-border)] p-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        data-tour="hce-contexto-clinico"
        className="flex min-h-[44px] items-center gap-1 text-sm font-medium text-[var(--color-interactive)] hover:underline"
      >
        <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
        Contexto clínico de base
      </button>

      {expanded && (
        <div className="mt-2">
          {isPending && (
            <div role="status" aria-label="Cargando contexto clínico de base">
              <div className="h-24 animate-pulse rounded bg-[#f5f5f7]" />
            </div>
          )}

          {isError && (
            <p role="alert" className="text-xs text-[var(--color-text-secondary)]">
              No se pudo cargar el contexto clínico de base. Intentá de nuevo más tarde.
            </p>
          )}

          {!isPending && !isError && data && (
            <PatientClinicalDataEditor
              patientId={patientId}
              clinicalData={data.clinical_data}
              readOnly={readOnly}
            />
          )}
        </div>
      )}
    </div>
  )
}

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

const GENERIC_SAVE_ERROR =
  'No se pudieron guardar los datos clínicos. Seguí escribiendo para reintentar.'

interface PatientClinicalDataEditorProps {
  patientId: string
  clinicalData: PatientClinicalData
  readOnly?: boolean
}

function PatientClinicalDataEditor({
  patientId,
  clinicalData,
  readOnly = false,
}: PatientClinicalDataEditorProps) {
  const queryClient = useQueryClient()
  const [antecedentes, setAntecedentes] = useState(clinicalData.antecedentes ?? '')
  const [alergias, setAlergias] = useState(clinicalData.alergias ?? '')
  const [medicacion, setMedicacion] = useState(clinicalData.medicacion ?? '')
  const [cirugias, setCirugias] = useState(clinicalData.cirugias ?? '')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Último contenido PERSISTIDO (al montar = lo que trajo el GET; tras cada PUT
  // exitoso se actualiza a lo enviado). Mientras el texto coincida con esto, no
  // se dispara el autosave. ⚠️ Patch (a) del review 14.3: si quedara fijo en los
  // valores de montaje, revertir el texto al valor original después de un guardado
  // NUNCA se persistiría (divergencia silenciosa UI/server en HCE).
  const lastSavedRef = useRef({
    antecedentes: clinicalData.antecedentes ?? '',
    alergias: clinicalData.alergias ?? '',
    medicacion: clinicalData.medicacion ?? '',
    cirugias: clinicalData.cirugias ?? '',
  })
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Patch (c) del review 14.3 — secuencia de guardados: descarta respuestas de
  // PUTs viejos que resuelvan DESPUÉS de uno más nuevo (no pisar status/cache/
  // lastSaved con datos obsoletos).
  const saveSeqRef = useRef(0)

  const triggerSave = useCallback(async () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)

    const seq = ++saveSeqRef.current
    setSaveStatus('saving')
    try {
      // El panel manda los 4 campos juntos — el contrato parcial del PUT es
      // robustez del API, no requisito de esta UI.
      const res = await fetch(`/api/patients/${patientId}/clinical-data`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ antecedentes, alergias, medicacion, cirugias }),
      })
      // Hay un guardado más nuevo en curso/terminado → esta respuesta es obsoleta.
      if (seq !== saveSeqRef.current) return

      if (!res.ok) {
        setErrorMessage(GENERIC_SAVE_ERROR)
        setSaveStatus('error')
        return
      }

      const data = (await res.json().catch(() => null)) as
        | { clinical_data: PatientClinicalData }
        | null
      if (seq !== saveSeqRef.current) return

      // Patch (a): lo enviado quedó persistido → actualizar la referencia de
      // "último guardado" para que un revert al texto original también dispare autosave.
      lastSavedRef.current = { antecedentes, alergias, medicacion, cirugias }
      // Patch (b): sincronizar la cache SIN invalidar (no refetch → no pisa el
      // tipeo): si el panel se colapsa y re-expande dentro del staleTime, el
      // editor remonta con los datos REALES del server.
      if (data?.clinical_data) {
        queryClient.setQueryData(['patient-clinical-data', patientId], {
          clinical_data: data.clinical_data,
        })
      }

      setErrorMessage(null)
      setSaveStatus('saved')
      // "Guardado ✓" vuelve a idle a los 2s
      savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      if (seq !== saveSeqRef.current) return
      setErrorMessage(GENERIC_SAVE_ERROR)
      setSaveStatus('error')
    }
  }, [patientId, antecedentes, alergias, medicacion, cirugias, queryClient])

  // Autosave con debounce 1200ms (molde SessionNotePanel). El cleanup del efecto
  // cancela el timer anterior en cada tipeo → un solo PUT por pausa.
  useEffect(() => {
    if (readOnly) return // sin autosave en solo lectura
    if (
      antecedentes === lastSavedRef.current.antecedentes &&
      alergias === lastSavedRef.current.alergias &&
      medicacion === lastSavedRef.current.medicacion &&
      cirugias === lastSavedRef.current.cirugias
    ) {
      return // Sin cambios respecto a lo último persistido — no guardar
    }
    debounceRef.current = setTimeout(() => {
      void triggerSave()
    }, 1200)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [antecedentes, alergias, medicacion, cirugias, readOnly])

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  const statusLabel = {
    idle: 'Se guarda automáticamente',
    pending: 'Se guarda automáticamente',
    saving: 'Guardando…',
    saved: 'Guardado ✓',
    error: errorMessage ?? GENERIC_SAVE_ERROR,
  }[saveStatus]

  const statusColor = {
    idle: 'var(--color-text-secondary)',
    pending: 'var(--color-text-secondary)',
    saving: 'var(--color-text-secondary)',
    saved: 'var(--color-success, #34c759)',
    error: 'var(--color-error, #ff3b30)',
  }[saveStatus]

  const handleChange =
    (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setter(e.target.value)
      setSaveStatus('pending')
    }

  const textareaClass =
    'w-full rounded-[6px] border border-[var(--color-border)] px-2 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-interactive)] disabled:bg-[#f5f5f7] disabled:text-[var(--color-text-secondary)]'

  const fields: Array<{
    id: string
    label: string
    value: string
    setter: (v: string) => void
  }> = [
    { id: 'antecedentes', label: 'Antecedentes', value: antecedentes, setter: setAntecedentes },
    { id: 'alergias', label: 'Alergias', value: alergias, setter: setAlergias },
    { id: 'medicacion', label: 'Medicación actual', value: medicacion, setter: setMedicacion },
    { id: 'cirugias', label: 'Cirugías', value: cirugias, setter: setCirugias },
  ]

  return (
    <div className="space-y-3">
      {fields.map((field) => (
        <div key={field.id}>
          <label
            htmlFor={`clinical-data-${field.id}-${patientId}`}
            className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]"
          >
            {field.label}
          </label>
          <textarea
            id={`clinical-data-${field.id}-${patientId}`}
            rows={2}
            value={field.value}
            onChange={handleChange(field.setter)}
            disabled={readOnly}
            className={textareaClass}
          />
        </div>
      ))}

      {/* Indicador de estado — inline, NUNCA toast. En readOnly no hay autosave. */}
      {!readOnly && (
        <span
          aria-live="polite"
          role={saveStatus === 'error' ? 'alert' : 'status'}
          className="block text-xs"
          style={{ color: statusColor }}
        >
          {statusLabel}
        </span>
      )}
    </div>
  )
}
