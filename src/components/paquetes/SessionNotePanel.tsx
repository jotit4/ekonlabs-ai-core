'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO, isValid } from 'date-fns'
import { es } from 'date-fns/locale'
import { useCurrentTenant } from '@/hooks/use-current-tenant'
import { SesionSerieBadge } from '@/components/agenda/SesionSerieBadge'
import type { SessionNote } from '@/types/treatments'

interface SessionNotePanelProps {
  appointmentId: string
  sessionIndex?: number | null
  totalSessions?: number | null
}

// Respuesta de GET /api/appointments/[id]/session-note — la nota + la firma
// (Fase 2): nombre de quien guardó/editó último (dashboard_users.full_name,
// resuelto server-side). NO es el profesional que atendió — es el autor real
// de la carga en el sistema (puede ser recepción).
interface SessionNoteResponse {
  note: SessionNote | null
  author_name: string | null
}

// Formatea la fecha de la firma con guarda de invalidez (mismo patrón que
// PaquetesTracking.fmtDate). Devuelve '—' si no parsea.
function fmtSignatureDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const parsed = parseISO(iso)
  if (!isValid(parsed)) return '—'
  return format(parsed, "d/MM/yyyy · HH:mm", { locale: es })
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
 * server; la RLS 041 es la segunda capa). Guardado EXPLÍCITO por botón (mismo
 * criterio que ClinicalNoteEditor, SIN react-hook-form): el autosave se sacó
 * porque guardar sin que el usuario lo pida es opaco en una HCE — nadie sabe
 * qué versión quedó asentada. El PUT sigue siendo upsert idempotente.
 * NO se invalida la query tras guardar (pisaría el tipeo): el GET alimenta
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

  const { data, isPending, isError } = useQuery<SessionNoteResponse>({
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
            <SessionNoteEditor
              appointmentId={appointmentId}
              note={data.note}
              authorName={data.author_name ?? null}
            />
          )}
        </div>
      )}
    </div>
  )
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const GENERIC_SAVE_ERROR =
  'No se pudo guardar la evolución. Volvé a tocar "Guardar evolución" para reintentar.'

interface SessionNoteEditorProps {
  appointmentId: string
  note: SessionNote | null
  authorName: string | null
}

// Firma mostrada bajo el editor: nombre de quien guardó + fecha de esa
// carga (updated_at, con fallback a created_at). null = todavía no hay nada
// guardado (nota nueva) → no se muestra la línea (AC 2 de la Fase 2).
interface Signature {
  authorName: string | null
  at: string
}

function signatureFromNote(note: SessionNote | null, authorName: string | null): Signature | null {
  if (!note) return null
  return { authorName, at: note.updated_at ?? note.created_at }
}

function SessionNoteEditor({ appointmentId, note, authorName }: SessionNoteEditorProps) {
  const queryClient = useQueryClient()
  const [workedOn, setWorkedOn] = useState(note?.worked_on ?? '')
  const [progress, setProgress] = useState(note?.progress ?? '')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // Firma visible (Fase 2 — "firma del licenciado"): se inicializa con lo que
  // trajo el GET y se actualiza tras cada guardado exitoso con la respuesta
  // del PUT (autor = quien acaba de guardar, fecha = la nota recién persistida).
  const [signature, setSignature] = useState<Signature | null>(signatureFromNote(note, authorName))

  // Último contenido PERSISTIDO (al montar = lo que trajo el GET; tras cada PUT
  // exitoso se actualiza a lo enviado). Es ESTADO y no ref porque de él se deriva
  // `isDirty`, que habilita el botón — un ref no re-renderiza. ⚠️ Debe
  // actualizarse tras cada guardado: si quedara fijo en los valores de montaje,
  // revertir el texto al valor original después de un guardado quedaría marcado
  // como "sin cambios" y no se podría persistir (divergencia UI/server en HCE).
  const [lastSaved, setLastSaved] = useState({
    workedOn: note?.worked_on ?? '',
    progress: note?.progress ?? '',
  })
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Guard anti doble-envío: el `disabled` del botón no cubre dos clicks emitidos
  // antes del re-render.
  const inFlightRef = useRef(false)
  // Secuencia de guardados: descarta respuestas de PUTs viejos que resuelvan
  // DESPUÉS de uno más nuevo (no pisar status/cache/lastSaved con datos obsoletos).
  // Nota: el reordenamiento server-side de dos PUTs en vuelo no es resoluble
  // client-side sin versionado — mismo límite aceptado que ClinicalNoteEditor.
  const saveSeqRef = useRef(0)

  const isDirty = workedOn !== lastSaved.workedOn || progress !== lastSaved.progress

  const triggerSave = useCallback(async () => {
    if (inFlightRef.current) return
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    inFlightRef.current = true

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

      const data = (await res.json().catch(() => null)) as SessionNoteResponse | null
      if (seq !== saveSeqRef.current) return

      // Lo enviado quedó persistido: actualizar "último guardado" para que un
      // revert al texto original vuelva a contar como cambio guardable.
      setLastSaved({ workedOn, progress })
      // Sincronizar la cache de la query SIN invalidar (no refetch → no pisa el
      // tipeo): si el panel se colapsa y re-expande dentro del staleTime, el
      // editor remonta con la nota REAL del server y no con la versión pre-edición
      // (editar sobre una versión vieja pisaría contenido más nuevo en el server).
      if (data?.note) {
        const authorNameFromSave = data.author_name ?? null
        queryClient.setQueryData(['session-note', appointmentId], {
          note: data.note,
          author_name: authorNameFromSave,
        })
        // Firma actualizada AL INSTANTE (quien acaba de guardar + la fecha de
        // esta nota): sin esto, la firma quedaría desactualizada hasta colapsar
        // y re-expandir el panel (staleTime 5min evita el refetch).
        setSignature(signatureFromNote(data.note, authorNameFromSave))
      }

      setErrorMessage(null)
      setSaveStatus('saved')
      // "Guardado ✓" vuelve a idle a los 2s
      savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      if (seq !== saveSeqRef.current) return
      setErrorMessage(GENERIC_SAVE_ERROR)
      setSaveStatus('error')
    } finally {
      inFlightRef.current = false
    }
  }, [appointmentId, workedOn, progress, queryClient])

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  // El estado visible se DERIVA de isDirty en vez de un status 'pending' propio:
  // así revertir el texto a mano al valor guardado limpia el cartel solo, y seguir
  // escribiendo después de guardar no deja un "Guardado ✓" mintiendo.
  const statusLabel =
    saveStatus === 'saving'
      ? 'Guardando…'
      : saveStatus === 'error'
        ? (errorMessage ?? GENERIC_SAVE_ERROR)
        : isDirty
          ? 'Cambios sin guardar'
          : saveStatus === 'saved'
            ? 'Guardado ✓'
            : ''

  const statusColor =
    saveStatus === 'error'
      ? 'var(--color-error, #ff3b30)'
      : !isDirty && saveStatus === 'saved'
        ? 'var(--color-success, #34c759)'
        : 'var(--color-text-secondary)'

  const handleChange =
    (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setter(e.target.value)
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

      <div className="flex items-center gap-3">
        {/* Indicador de estado — inline, NUNCA toast */}
        <span
          aria-live="polite"
          role={saveStatus === 'error' ? 'alert' : 'status'}
          className="block flex-1 text-xs"
          style={{ color: statusColor }}
        >
          {statusLabel}
        </span>

        {/* Guardado explícito: sin cambios pendientes el botón no hace nada útil,
            y durante el PUT se bloquea para no encadenar guardados. */}
        <button
          type="button"
          onClick={() => void triggerSave()}
          disabled={!isDirty || saveStatus === 'saving'}
          className="min-h-[44px] rounded-[6px] bg-[var(--color-interactive)] px-3 py-1.5 text-xs text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Guardar evolución
        </button>
      </div>

      {/* Firma (Fase 2): quien guardó/editó último la evolución + cuándo. Es el
          autor real de la carga en el sistema (puede ser recepción) — NO el
          profesional que atendió. Sin nota guardada todavía → no se muestra. */}
      {signature && (
        <p className="text-xs text-[var(--color-text-secondary)]">
          Firma: {signature.authorName ?? '—'} · {fmtSignatureDate(signature.at)}
        </p>
      )}
    </div>
  )
}
