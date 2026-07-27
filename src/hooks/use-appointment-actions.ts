'use client'

import React, { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Appointment } from '@/types/appointments'
import type { AbsenceDecision } from '@/lib/schemas/absence-decision.schema'

// Componente para Toast de Sonner con temporizador de cuenta regresiva
function ToastWithCountdown({
  patientName,
  onUndo,
  closeToast,
}: {
  patientName: string
  onUndo: () => void
  closeToast: () => void
}) {
  const [seconds, setSeconds] = useState(10)
  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          closeToast()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [closeToast])

  return React.createElement(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: 4, width: '100%' } },
    React.createElement(
      'div',
      { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 8 } },
      React.createElement(
        'span',
        { style: { fontSize: 13, fontWeight: 500 } },
        `Se marcó la inasistencia de ${patientName} (${seconds}s)`
      ),
      React.createElement(
        'button',
        {
          onClick: () => {
            onUndo()
            closeToast()
          },
          style: {
            fontSize: 12,
            fontWeight: 600,
            padding: '4px 8px',
            backgroundColor: 'var(--color-surface, #f3f4f6)',
            color: 'var(--color-interactive, #0071e3)',
            border: '1px solid var(--color-border, #d1d5db)',
            borderRadius: 6,
            cursor: 'pointer',
          },
        },
        '↩ Deshacer Acción'
      )
    )
  )
}

// ─── Hook compartido de acciones sobre turnos ─────────────────────────────────
// Centraliza la lógica de updateStatus / cancel / no_show / completed para
// que tanto DayListView como TurnoDetailModal usen el mismo endpoint y la
// misma lógica de decisión de serie (Story 13.6).
//
// Recibe `date` para invalidar las queries correctas al completar cada acción.

export interface AppointmentActionsState {
  // Cancelación
  cancelTarget: Appointment | null
  cancelLoading: boolean
  cancelError: string | null
  setCancelTarget: (apt: Appointment | null) => void
  clearCancelError: () => void
  /**
   * Devuelve `true` sólo si el turno se canceló DIRECTO y con éxito. Devuelve
   * `false` si falló (el error queda en `cancelError`) o si el turno es de
   * serie y se derivó al AbsenceDecisionDialog. El host usa el booleano para
   * decidir si cierra su modal.
   */
  handleCancelConfirm: () => Promise<boolean>

  // Asistencia (completed / no_show)
  attendanceLoading: boolean
  /**
   * Devuelve `true` sólo si el estado se aplicó DIRECTO y con éxito. Devuelve
   * `false` si falló (se avisa por toast) o si se derivó al
   * AbsenceDecisionDialog (no_show de un turno de serie).
   */
  handleAttendanceSelect: (
    appointment: Appointment,
    status: 'completed' | 'no_show'
  ) => Promise<boolean>

  // Decisión de serie (no_show / cancelled para turnos con package_id)
  absenceTarget: { appointment: Appointment; action: 'no_show' | 'cancelled' } | null
  absenceLoading: boolean
  absenceError: string | null
  clearAbsenceTarget: () => void
  handleAbsenceConfirm: (decision: AbsenceDecision, note?: string) => Promise<void>

  // Color manual del turno (migración 051 — paleta muda del turnero, pedido ISADI)
  colorLoading: boolean
  colorError: string | null
  handleColorChange: (appointment: Appointment, color: string | null) => Promise<boolean>
}

export function useAppointmentActions(date: string): AppointmentActionsState {
  const queryClient = useQueryClient()

  // Cancelación directa (turnos sueltos)
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  // Asistencia
  const [attendanceLoading, setAttendanceLoading] = useState(false)

  // Decisión de serie
  const [absenceTarget, setAbsenceTarget] = useState<
    { appointment: Appointment; action: 'no_show' | 'cancelled' } | null
  >(null)
  const [absenceLoading, setAbsenceLoading] = useState(false)
  const [absenceError, setAbsenceError] = useState<string | null>(null)

  // Color manual (migración 051)
  const [colorLoading, setColorLoading] = useState(false)
  const [colorError, setColorError] = useState<string | null>(null)

  async function updateStatus(
    appointmentId: string,
    status: 'cancelled' | 'completed' | 'no_show',
    extra?: { decision: AbsenceDecision; note?: string }
  ) {
    const payload: { status: typeof status; decision?: AbsenceDecision; note?: string } = { status }
    if (extra) {
      payload.decision = extra.decision
      if (extra.note !== undefined) payload.note = extra.note
    }
    const response = await fetch(`/api/appointments/${appointmentId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error((body as { error?: string }).error ?? 'Error al actualizar el turno')
    }
  }

  // Invalida TODA la agenda, no sólo el día.
  //
  // Bug ISADI 2026-07-24: se invalidaba únicamente ['agenda', 'day', date], pero
  // las vistas Semana y Mes leen de ['agenda', 'range', ...] (use-appointments-range).
  // Resultado: se cancelaba/marcaba en la base y el turno seguía en pantalla en
  // Semana/Mes → para la recepcionista "el botón no hace nada".
  // El prefijo 'agenda' a secas cubre day + range + day-status de una sola vez
  // (mismo criterio que ya usaba handleColorChange).
  function invalidateAgendaQueries() {
    queryClient.invalidateQueries({ queryKey: ['agenda'] })
    // El día del host puede no estar montado (p. ej. se canceló desde Semana):
    // refetchType 'all' fuerza que también se refresque cuando vuelva a mostrarse.
    queryClient.invalidateQueries({ queryKey: ['agenda', 'day', date], refetchType: 'all' })
  }

  function invalidateTrackingQueries(patientId: string | null) {
    invalidateAgendaQueries()
    queryClient.invalidateQueries({ queryKey: ['treatments'], exact: false })
    if (patientId) {
      queryClient.invalidateQueries({ queryKey: ['treatments', 'by-patient', patientId] })
    }
  }

  function showUndoToast(appointmentId: string, patientName: string) {
    const handleUndo = async () => {
      try {
        const response = await fetch(`/api/appointments/${appointmentId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_undo: true }),
        })
        if (!response.ok) {
          throw new Error('No se pudo deshacer la acción')
        }
        toast.success('Acción deshecha correctamente.')
        queryClient.invalidateQueries({ queryKey: ['agenda'] })
        queryClient.invalidateQueries({ queryKey: ['treatments'] })
      } catch {
        toast.error('Error al deshacer la acción.')
      }
    }

    const toastId = toast(
      () =>
        React.createElement(ToastWithCountdown, {
          patientName,
          onUndo: handleUndo,
          closeToast: () => toast.dismiss(toastId),
        }),
      { duration: 10000 }
    )
  }

  // Devuelve true SÓLO si la cancelación directa se aplicó con éxito.
  async function handleCancelConfirm(): Promise<boolean> {
    if (!cancelTarget) return false
    // Turno de serie → abrir el diálogo de decisión en lugar de cancelar directo.
    // No es un éxito todavía: el host NO debe cerrarse (el diálogo se superpone).
    if (cancelTarget.package_id) {
      setCancelError(null)
      setAbsenceError(null)
      setAbsenceTarget({ appointment: cancelTarget, action: 'cancelled' })
      setCancelTarget(null)
      return false
    }
    setCancelLoading(true)
    setCancelError(null)
    const patientName = cancelTarget.patients?.full_name || 'Paciente'
    try {
      await updateStatus(cancelTarget.appointment_id, 'cancelled')
      invalidateAgendaQueries()
      // Cancelar libera el hueco: la disponibilidad mostrada queda vieja si no se invalida.
      queryClient.invalidateQueries({ queryKey: ['availability'], exact: false })
      setCancelTarget(null)
      toast.success(`Turno de ${patientName} cancelado.`)
      return true
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Error al cancelar el turno')
      return false
    } finally {
      setCancelLoading(false)
    }
  }

  // Devuelve true SÓLO si el estado se aplicó directo y con éxito.
  async function handleAttendanceSelect(
    appointment: Appointment,
    status: 'completed' | 'no_show'
  ): Promise<boolean> {
    // Story 13.6 — no_show de un turno de serie → diálogo de decisión manual.
    // 'completed' (confirmar asistencia) NUNCA dispara el diálogo.
    if (status === 'no_show' && appointment.package_id) {
      setAbsenceError(null)
      setAbsenceTarget({ appointment, action: 'no_show' })
      return false
    }
    setAttendanceLoading(true)
    try {
      await updateStatus(appointment.appointment_id, status)
      invalidateAgendaQueries()
      if (status === 'no_show') {
        showUndoToast(appointment.appointment_id, appointment.patients?.full_name || 'Paciente')
      }
      return true
    } catch (err) {
      // El error ya NO se silencia: si el PATCH falla, el host se quedaba cerrado
      // creyendo que había confirmado la asistencia (ISADI 2026-07-24).
      toast.error(
        err instanceof Error ? err.message : 'No se pudo actualizar el estado del turno',
      )
      return false
    } finally {
      setAttendanceLoading(false)
    }
  }

  async function handleAbsenceConfirm(decision: AbsenceDecision, note?: string) {
    if (!absenceTarget) return
    setAbsenceLoading(true)
    setAbsenceError(null)
    const apptId = absenceTarget.appointment.appointment_id
    const action = absenceTarget.action
    const patientName = absenceTarget.appointment.patients?.full_name || 'Paciente'
    try {
      await updateStatus(apptId, action, {
        decision,
        note,
      })
      invalidateTrackingQueries(absenceTarget.appointment.patient_id)
      setAbsenceTarget(null)
      if (action === 'no_show') {
        showUndoToast(apptId, patientName)
      }
    } catch (err) {
      setAbsenceError(err instanceof Error ? err.message : 'Error al aplicar la decisión')
    } finally {
      setAbsenceLoading(false)
    }
  }

  // Cambiar (o limpiar, color=null) el color manual del turno. Endpoint
  // dedicado /color (no pasa por updateStatus: es un concepto independiente
  // del estado). Invalida la agenda del día para refrescar el chip; el
  // realtime (use-agenda-realtime) ya cubre semana/mes en cualquier caso.
  // Devuelve true si el color se guardó, para que el modal pueda cerrarse solo.
  async function handleColorChange(appointment: Appointment, color: string | null): Promise<boolean> {
    setColorLoading(true)
    setColorError(null)
    try {
      const response = await fetch(`/api/appointments/${appointment.appointment_id}/color`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ color }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? 'Error al cambiar el color del turno')
      }
      // Prefijo 'agenda' a secas: el color se cambia también desde Semana y Mes,
      // que consultan ['agenda', 'range', ...] — invalidar solo el día los dejaba stale.
      queryClient.invalidateQueries({ queryKey: ['agenda'] })
      return true
    } catch (err) {
      setColorError(err instanceof Error ? err.message : 'Error al cambiar el color del turno')
      return false
    } finally {
      setColorLoading(false)
    }
  }

  return {
    cancelTarget,
    cancelLoading,
    cancelError,
    setCancelTarget,
    clearCancelError: () => setCancelError(null),
    handleCancelConfirm,
    attendanceLoading,
    handleAttendanceSelect,
    absenceTarget,
    absenceLoading,
    absenceError,
    clearAbsenceTarget: () => { setAbsenceTarget(null); setAbsenceError(null) },
    handleAbsenceConfirm,
    colorLoading,
    colorError,
    handleColorChange,
  }
}
