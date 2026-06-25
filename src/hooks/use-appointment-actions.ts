'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Appointment } from '@/types/appointments'
import type { AbsenceDecision } from '@/lib/schemas/absence-decision.schema'

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
    try {
      await updateStatus(absenceTarget.appointment.appointment_id, absenceTarget.action, {
        decision,
        note,
      })
      invalidateTrackingQueries(absenceTarget.appointment.patient_id)
      setAbsenceTarget(null)
    } catch (err) {
      setAbsenceError(err instanceof Error ? err.message : 'Error al aplicar la decisión')
    } finally {
      setAbsenceLoading(false)
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
  }
}
