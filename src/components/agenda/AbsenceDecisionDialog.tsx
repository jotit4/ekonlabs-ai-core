'use client'

import { useState, useEffect } from 'react'
import type { Appointment } from '@/types/appointments'
import type { AbsenceDecision } from '@/lib/schemas/absence-decision.schema'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { startOfMonth, endOfMonth } from 'date-fns'

// ─── Diálogo de decisión manual al ausentarse una sesión de serie (Story 13.6) ───
//
// Aparece SOLO para turnos de serie (package_id != null) al marcar no_show o cancelar.
// 3 opciones, NINGUNA pre-seleccionada — la recepcionista elige explícitamente:
//   - Recuperar → no descuenta.
//   - Consumir  → descuenta 1 sesión (server-side).
//   - Justificar con nota → no descuenta; persiste el motivo (cancellation_reason).
//
// La decisión/descuento/persistencia los ejecuta el endpoint server-side; este
// componente sólo recolecta la elección y delega en onConfirm.

interface AbsenceDecisionDialogProps {
  appointment: Appointment
  action: 'no_show' | 'cancelled'
  onConfirm: (decision: AbsenceDecision, note?: string) => void
  onClose: () => void
  isLoading: boolean
  error: string | null
}

const ACTION_LABELS: Record<'no_show' | 'cancelled', string> = {
  no_show: 'marcar como no-show',
  cancelled: 'cancelar',
}

interface OptionMeta {
  value: AbsenceDecision
  title: string
  description: string
}

const OPTIONS: OptionMeta[] = [
  {
    value: 'recover',
    title: 'Recuperar',
    description: 'No descuenta la sesión. Queda pendiente de reagendar.',
  },
  {
    value: 'consume',
    title: 'Consumir',
    description: 'Descuenta 1 sesión del paquete.',
  },
  {
    value: 'justify',
    title: 'Justificar con nota',
    description: 'No descuenta. Guarda el motivo del ausentismo.',
  },
]

export function AbsenceDecisionDialog({
  appointment,
  action,
  onConfirm,
  onClose,
  isLoading,
  error,
}: AbsenceDecisionDialogProps) {
  // NINGUNA opción pre-seleccionada (AC1): null hasta que la recepcionista elige.
  const [decision, setDecision] = useState<AbsenceDecision | null>(null)
  const [note, setNote] = useState('')
  const [absenceStats, setAbsenceStats] = useState<{ currentMonth: number; total: number } | null>(null)
  const [isLoadingStats, setIsLoadingStats] = useState(false)

  const patientName = appointment.patients?.full_name ?? 'Paciente'
  const totalSessions = appointment.treatments?.total_sessions
  const sessionIndex = appointment.session_index ?? undefined

  useEffect(() => {
    let isMounted = true
    if (!appointment.patient_id) return

    const fetchAbsenceStats = async () => {
      setIsLoadingStats(true)
      try {
        const supabase = createSupabaseBrowserClient()
        const { data, error } = await supabase
          .from('appointments')
          .select('start_at, status')
          .eq('patient_id', appointment.patient_id)
          .eq('status', 'no_show')

        if (error) {
          console.error('[AbsenceDecisionDialog] Error fetching absence stats:', error)
          return
        }

        if (isMounted && data) {
          const now = new Date()
          const startMonth = startOfMonth(now)
          const endMonth = endOfMonth(now)

          const total = data.length
          const currentMonth = data.filter((appt: any) => {
            const date = new Date(appt.start_at)
            return date >= startMonth && date <= endMonth
          }).length

          setAbsenceStats({ currentMonth, total })
        }
      } catch (err) {
        console.error('[AbsenceDecisionDialog] Error in fetchAbsenceStats:', err)
      } finally {
        if (isMounted) setIsLoadingStats(false)
      }
    }

    void fetchAbsenceStats()

    return () => {
      isMounted = false
    }
  }, [appointment.patient_id])

  const justifyEmpty = decision === 'justify' && note.trim() === ''
  const confirmDisabled = isLoading || decision === null || justifyEmpty

  function handleConfirm() {
    if (decision === null || confirmDisabled) return
    onConfirm(decision, decision === 'justify' ? note.trim() : undefined)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="absence-decision-title"
      style={{
        position: 'fixed',
        inset: 0,
        // 60, NO 50: este diálogo es un SEGUNDO nivel de modal — se abre desde
        // TurnoDetailModal, cuyo Dialog.Popup es `fixed inset-0 z-50` y además
        // vive en un portal al final del <body>. Con el mismo z-index gana el
        // que va después en el DOM (el portal), así que este diálogo quedaba
        // debajo de una capa a pantalla completa: invisible y sin poder
        // clickearse. Síntoma reportado por ISADI el 2026-07-27: cancelar un
        // turno de serie "no hacía nada" — el diálogo estaba ahí, tapado.
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 0,
        }}
        onClick={isLoading ? undefined : onClose}
        aria-hidden="true"
      />
      {/* Dialog */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          background: 'var(--color-bg)',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          width: '100%',
          maxWidth: 460,
          padding: 24,
        }}
      >
        <h2
          id="absence-decision-title"
          style={{
            fontSize: 17,
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            marginBottom: 8,
          }}
        >
          ¿Qué pasa con esta sesión?
        </h2>
        <p
          style={{
            fontSize: 14,
            color: 'var(--color-text-secondary)',
            marginBottom: 8,
          }}
        >
          Vas a {ACTION_LABELS[action]} el turno de <strong>{patientName}</strong>.
          Elegí qué hacer con la sesión del paquete.
        </p>

        {/* Historial de ausencias */}
        {absenceStats !== null && (
          <div
            style={{
              borderRadius: 8,
              border: '1px solid #fca5a5',
              backgroundColor: 'rgba(254, 226, 226, 0.4)',
              padding: 12,
              marginBottom: 16,
              fontSize: 12,
              color: '#991b1b',
            }}
          >
            <strong style={{ display: 'block', marginBottom: 2 }}>Inasistencias de {patientName}:</strong>
            <span>
              Este mes: <strong>{absenceStats.currentMonth}</strong>{absenceStats.currentMonth === 1 ? ' ausencia' : ' ausencias'}
              {' · '}
              Total histórico: <strong>{absenceStats.total}</strong>{absenceStats.total === 1 ? ' ausencia' : ' ausencias'}
            </span>
          </div>
        )}

        {/* Contador del paquete (si está disponible) */}
        {totalSessions != null && (
          <p
            style={{
              fontSize: 13,
              color: 'var(--color-text-secondary)',
              marginBottom: 16,
            }}
          >
            Paquete: {totalSessions} sesiones en total
            {sessionIndex != null ? ` · esta es la sesión ${sessionIndex}` : ''}.
          </p>
        )}

        {/* Opciones — ninguna pre-seleccionada */}
        <div
          role="radiogroup"
          aria-label="Decisión sobre la sesión"
          style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}
        >
          {OPTIONS.map((opt) => {
            const selected = decision === opt.value
            return (
              <label
                key={opt.value}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: selected
                    ? '1px solid var(--color-interactive)'
                    : '1px solid var(--color-border)',
                  background: selected ? 'var(--color-surface)' : 'none',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                }}
              >
                <input
                  type="radio"
                  name="absence-decision"
                  value={opt.value}
                  checked={selected}
                  disabled={isLoading}
                  onChange={() => setDecision(opt.value)}
                  style={{ marginTop: 3 }}
                />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    {opt.title}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    {opt.description}
                  </span>
                </span>
              </label>
            )
          })}
        </div>

        {/* Textarea de motivo — sólo habilitado/requerido al elegir "Justificar" */}
        {decision === 'justify' && (
          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="absence-decision-note"
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--color-text-primary)',
                marginBottom: 6,
              }}
            >
              Motivo (requerido)
            </label>
            <textarea
              id="absence-decision-note"
              value={note}
              disabled={isLoading}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Ej: aviso anticipado por enfermedad"
              style={{
                width: '100%',
                resize: 'vertical',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg)',
                color: 'var(--color-text-primary)',
                fontSize: 14,
                fontFamily: 'inherit',
              }}
            />
          </div>
        )}

        {/* Error visible (no cerrar el diálogo en error) */}
        {error && (
          <p role="alert" style={{ fontSize: 13, color: '#ef4444', marginBottom: 12 }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid var(--color-border)',
              background: 'none',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--color-text-primary)',
              minHeight: 44,
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirmDisabled}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--color-interactive)',
              cursor: confirmDisabled ? 'not-allowed' : 'pointer',
              fontSize: 14,
              fontWeight: 500,
              color: 'white',
              minHeight: 44,
              opacity: confirmDisabled ? 0.6 : 1,
            }}
          >
            {isLoading ? 'Aplicando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
