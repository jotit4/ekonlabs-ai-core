'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCurrentTenant } from '@/hooks/use-current-tenant'
import { SesionSerieBadge } from '@/components/agenda/SesionSerieBadge'
import type { SessionNote } from '@/types/treatments'

interface SessionNotePanelProps {
  appointmentId: string
  sessionIndex?: number | null
  totalSessions?: number | null
}

/**
 * Evolución por sesión ligada al turno (Story 14.3 — Epic 14 HCE).
 *
 * AUTO-GATEADO POR ROL: HCE (Ley 25.326) → doctor/admin/receptionist. Mientras
 * carga el rol (o para cualquier otro rol) devuelve null: ni botón ni sección
 * ni fetch. Los hosts (TurnoDetailModal / PaquetesTracking) lo montan sin
 * lógica de rol propia.
 *
 * Colapsado por defecto; al expandir carga la evolución vía
 * GET /api/appointments/[id]/session-note (API Route — el guard 403 vive en el
 * server; la RLS 041 es la segunda capa). Autosave con debounce 1200ms (patrón
 * ClinicalNoteEditor, SIN react-hook-form): PUT = upsert idempotente → seguro.
 * NO se invalida la query en cada autosave (pisaría el tipeo): el GET alimenta
 * el estado inicial al expandir; los guardados solo actualizan el status.
 *
 * Muestra "Sesión X/N" reusando SesionSerieBadge (turno suelto sin sessionIndex
 * → el badge no renderiza nada, lógica ya implementada en el badge).
 */
export function SessionNotePanel({
  appointmentId,
  sessionIndex,
  totalSessions,
}: SessionNotePanelProps) {
  const { role, loading } = useCurrentTenant()

  // Gate de rol ANTES de montar el contenido (componente aparte para no
  // condicionar hooks): rol desconocido / cargando → nada.
  if (loading || !['doctor', 'admin', 'receptionist'].includes(role ?? '')) return null

  return (
    <SessionNotePanelContent
      appointmentId={appointmentId}
      sessionIndex={sessionIndex}
      totalSessions={totalSessions}
    />
  )
}

function SessionNotePanelContent({
  appointmentId,
  sessionIndex,
  totalSessions,
}: SessionNotePanelProps) {
  const [expanded, setExpanded] = useState(false)

  const { data, isPending, isError } = useQuery<{ note: SessionNote | null }>({
    queryKey: ['session-note', appointmentId],
    queryFn: async () => {
      const res = await fetch(`/api/appointments/${appointmentId}/session-note`)
      if (!res.ok) throw new Error('Error al cargar la evolución')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
    enabled: expanded,
  })

  return (
    <div className="mt-3 border-t border-[var(--color-border)] pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex min-h-[44px] items-center gap-1 text-xs font-medium text-[var(--color-interactive)] hover:underline"
        >
          <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
          Evolución de la sesión
        </button>
        <SesionSerieBadge sessionIndex={sessionIndex ?? null} totalSessions={totalSessions ?? null} />
      </div>

      {expanded && (
        <div className="mt-2">
          {isPending && (
            <div role="status" aria-label="Cargando evolución de la sesión">
              <div className="h-24 animate-pulse rounded bg-[#f5f5f7]" />
            </div>
          )}

          {isError && (
            <p role="alert" className="text-xs text-[var(--color-text-secondary)]">
              No se pudo cargar la evolución de la sesión. Intentá de nuevo más tarde.
            </p>
          )}

          {!isPending && !isError && data && (
            <SessionNoteEditor appointmentId={appointmentId} note={data.note} />
          )}
        </div>
      )}
    </div>
  )
}

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

const GENERIC_SAVE_ERROR =
  'No se pudo guardar la evolución. Seguí escribiendo para reintentar.'

interface SessionNoteEditorProps {
  appointmentId: string
  note: SessionNote | null
}

function SessionNoteEditor({ appointmentId, note }: SessionNoteEditorProps) {
  const queryClient = useQueryClient()
  const [workedOn, setWorkedOn] = useState(note?.worked_on ?? '')
  const [progress, setProgress] = useState(note?.progress ?? '')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Último contenido PERSISTIDO (al montar = lo que trajo el GET; tras cada PUT
  // exitoso se actualiza a lo enviado). Mientras el texto coincida con esto, no
  // se dispara el autosave. ⚠️ Debe actualizarse tras cada guardado: si quedara
  // fijo en los valores de montaje, revertir el texto al valor original después
  // de un guardado NUNCA se persistiría (divergencia silenciosa UI/server en HCE).
  const lastSavedRef = useRef({ workedOn: note?.worked_on ?? '', progress: note?.progress ?? '' })
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Secuencia de guardados: descarta respuestas de PUTs viejos que resuelvan
  // DESPUÉS de uno más nuevo (no pisar status/cache/lastSaved con datos obsoletos).
  // Nota: el reordenamiento server-side de dos PUTs en vuelo no es resoluble
  // client-side sin versionado — mismo límite aceptado que ClinicalNoteEditor.
  const saveSeqRef = useRef(0)

  const triggerSave = useCallback(async () => {
    // Cancelar debounce pendiente
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)

    const seq = ++saveSeqRef.current
    setSaveStatus('saving')
    try {
      const res = await fetch(`/api/appointments/${appointmentId}/session-note`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worked_on: workedOn, progress }),
      })
      // Hay un guardado más nuevo en curso/terminado → esta respuesta es obsoleta.
      if (seq !== saveSeqRef.current) return

      if (!res.ok) {
        // 422 (turno sin paciente) trae un mensaje accionable del server.
        let message = GENERIC_SAVE_ERROR
        if (res.status === 422) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null
          if (data?.error) message = data.error
        }
        setErrorMessage(message)
        setSaveStatus('error')
        return
      }

      const data = (await res.json().catch(() => null)) as { note: SessionNote | null } | null
      if (seq !== saveSeqRef.current) return

      // Lo enviado quedó persistido: actualizar la referencia de "último guardado"
      // para que un revert al texto original también dispare autosave.
      lastSavedRef.current = { workedOn, progress }
      // Sincronizar la cache de la query SIN invalidar (no refetch → no pisa el
      // tipeo): si el panel se colapsa y re-expande dentro del staleTime, el
      // editor remonta con la nota REAL del server y no con la versión pre-edición
      // (editar sobre una versión vieja pisaría contenido más nuevo en el server).
      if (data?.note) {
        queryClient.setQueryData(['session-note', appointmentId], { note: data.note })
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
  }, [appointmentId, workedOn, progress, queryClient])

  // Autosave con debounce 1200ms (patrón ClinicalNoteEditor). El cleanup del
  // efecto cancela el timer anterior en cada tipeo → un solo PUT por pausa.
  useEffect(() => {
    if (
      workedOn === lastSavedRef.current.workedOn &&
      progress === lastSavedRef.current.progress
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
  }, [workedOn, progress])

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
    'w-full rounded-[6px] border border-[var(--color-border)] px-2 py-1.5 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-interactive)]'

  return (
    <div className="space-y-3">
      <div>
        <label
          htmlFor={`session-note-worked-${appointmentId}`}
          className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]"
        >
          Qué se trabajó
        </label>
        <textarea
          id={`session-note-worked-${appointmentId}`}
          rows={2}
          value={workedOn}
          onChange={handleChange(setWorkedOn)}
          className={textareaClass}
        />
      </div>

      <div>
        <label
          htmlFor={`session-note-progress-${appointmentId}`}
          className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]"
        >
          Progreso observado
        </label>
        <textarea
          id={`session-note-progress-${appointmentId}`}
          rows={2}
          value={progress}
          onChange={handleChange(setProgress)}
          className={textareaClass}
        />
      </div>

      {/* Indicador de estado — inline, NUNCA toast */}
      <span
        aria-live="polite"
        role={saveStatus === 'error' ? 'alert' : 'status'}
        className="block text-xs"
        style={{ color: statusColor }}
      >
        {statusLabel}
      </span>
    </div>
  )
}
