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
  handleCancelConfirm: () => Promise<void>

  // Asistencia (completed / no_show)
  attendanceLoading: boolean
  handleAttendanceSelect: (
    appointment: Appointment,
    status: 'completed' | 'no_show'
  ) => Promise<void>

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

  function invalidateTrackingQueries(patientId: string | null) {
    queryClient.invalidateQueries({ queryKey: ['agenda', 'day', date] })
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
      } catch (err) {
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

  async function handleCancelConfirm() {
    if (!cancelTarget) return
    // Turno de serie → abrir el diálogo de decisión en lugar de cancelar directo.
    if (cancelTarget.package_id) {
      setCancelError(null)
      setAbsenceError(null)
      setAbsenceTarget({ appointment: cancelTarget, action: 'cancelled' })
      setCancelTarget(null)
      return
    }
    setCancelLoading(true)
    setCancelError(null)
    try {
      await updateStatus(cancelTarget.appointment_id, 'cancelled')
      queryClient.invalidateQueries({ queryKey: ['agenda', 'day', date] })
      setCancelTarget(null)
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Error al cancelar el turno')
    } finally {
      setCancelLoading(false)
    }
  }

  async function handleAttendanceSelect(
    appointment: Appointment,
    status: 'completed' | 'no_show'
  ) {
    // Story 13.6 — no_show de un turno de serie → diálogo de decisión manual.
    // 'completed' (confirmar asistencia) NUNCA dispara el diálogo.
    if (status === 'no_show' && appointment.package_id) {
      setAbsenceError(null)
      setAbsenceTarget({ appointment, action: 'no_show' })
      return
    }
    setAttendanceLoading(true)
    try {
      await updateStatus(appointment.appointment_id, status)
      queryClient.invalidateQueries({ queryKey: ['agenda', 'day', date] })
      if (status === 'no_show') {
        showUndoToast(appointment.appointment_id, appointment.patients?.full_name || 'Paciente')
      }
    } catch {
      // silently — error puede mejorarse en siguiente iteración
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
