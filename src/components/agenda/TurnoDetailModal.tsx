'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Dialog } from '@base-ui/react/dialog'
import { PatientQuickDrawer } from '@/components/conversaciones/PatientQuickDrawer'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { type Appointment, STATUS_LABELS } from '@/types/appointments'
import { StatusDot, statusToVariant } from '@/components/shared/StatusDot'
import { ReminderBadge } from './ReminderBadge'
import { SesionSerieBadge } from './SesionSerieBadge'
import { SessionNotePanel } from '@/components/paquetes/SessionNotePanel'
import { AbsenceDecisionDialog } from './AbsenceDecisionDialog'
import { CancelConfirmInline } from './CancelConfirmInline'
import { ColorSwatchPicker } from './ColorSwatchPicker'
import { useAppointmentActions } from '@/hooks/use-appointment-actions'
import type { AbsenceDecision } from '@/lib/schemas/absence-decision.schema'

// ─── Props del modal ──────────────────────────────────────────────────────────

interface TurnoDetailModalProps {
  open: boolean
  appointment: Appointment | null
  onClose: () => void
  onReschedule: (appointment: Appointment) => void
  // `date` es necesario para invalidar las queries correctas. Opcional para
  // compatibilidad con la rama Semana/Mes que ya existía (en ese caso se
  // intenta derivar desde appointment.start_at como fallback).
  date?: string
}

export function TurnoDetailModal({
  open,
  appointment,
  onClose,
  onReschedule,
  date,
}: TurnoDetailModalProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  // Fecha para invalidar queries: prop `date` tiene prioridad; sino, se deriva
  // de start_at del turno (formato YYYY-MM-DD); sino, cadena vacía (no invalida).
  const effectiveDate =
    date ??
    (appointment?.start_at ? appointment.start_at.slice(0, 10) : '')

  const actions = useAppointmentActions(effectiveDate)

  const patientName = appointment?.patients?.full_name ?? 'Paciente'
  const serviceName = appointment?.services?.name ?? '-'
  const professionalName =
    appointment?.professionals?.name ??
    appointment?.services?.professional_name ??
    'Sin asignar'
  const fechaHora = appointment
    ? format(parseISO(appointment.start_at), "EEEE d 'de' MMMM 'a las' HH:mm", { locale: es })
    : ''

  const status = appointment?.status
  const isCancelled = status === 'cancelled'
  const isCompleted = status === 'completed'
  const isNoShow = status === 'no_show'
  // Acciones de cambio de estado no aplican si ya está en estado terminal
  const isTerminal = isCancelled || isCompleted || isNoShow

  function handleClose() {
    // Limpiar estados internos al cerrar
    actions.setCancelTarget(null)
    actions.clearCancelError()
    actions.clearAbsenceTarget()
    onClose()
  }

  // Handler de cancelar: abre la confirmación inline
  function handleCancelClick() {
    if (!appointment) return
    actions.clearCancelError()
    actions.setCancelTarget(appointment)
  }

  // Handler de asistencia: completed o no_show
  async function handleAttendanceClick(s: 'completed' | 'no_show') {
    if (!appointment) return
    await actions.handleAttendanceSelect(appointment, s)
    // Para turnos de serie con no_show, el hook activa absenceTarget en vez de
    // completar la acción directa — el AbsenceDecisionDialog se superpone
    // sobre el modal sin cerrar el modal principal.
    // Para cualquier otro caso (completed, o no_show suelto) cerramos el modal
    // porque la acción se completó (el hook no lanza errores, los silencia).
    if (!(s === 'no_show' && appointment.package_id)) {
      handleClose()
    }
  }

  // Tras confirmar la decisión de serie: el hook limpia absenceTarget si tuvo
  // éxito, o setea absenceError si falló (lo muestra el AbsenceDecisionDialog).
  // Cerramos siempre el modal principal; AbsenceDecisionDialog se monta FUERA
  // del Dialog.Portal y seguirá visible aunque el modal principal se cierre
  // (mientras absenceTarget no sea null).
  async function handleAbsenceConfirm(decision: AbsenceDecision, note?: string) {
    await actions.handleAbsenceConfirm(decision, note)
    // Cerramos el modal principal independientemente del resultado.
    // Si hubo error, absenceTarget sigue activo → AbsenceDecisionDialog muestra
    // el error y permite reintentar, ya sin el modal principal como fondo.
    handleClose()
  }

  // Tras confirmar cancelación inline: el hook cancela (o abre absenceTarget
  // para turnos de serie) y maneja errores internamente. No cerramos acá:
  // el CancelConfirmInline muestra el error si lo hay. Si era de serie,
  // cancelTarget se limpiará y absenceTarget se activará → AbsenceDecisionDialog.
  async function handleCancelConfirm() {
    await actions.handleCancelConfirm()
    // Tras una cancelación directa exitosa, cancelTarget queda null en el hook,
    // así que el CancelConfirmInline desaparece automáticamente.
    // Para series, absenceTarget se activa → AbsenceDecisionDialog aparece.
    // No necesitamos cerrar el modal principal aquí.
  }

  // Botón Reprogramar
  function handleRescheduleClick() {
    if (!appointment) return
    handleClose()
    onReschedule(appointment)
  }

  return (
    <>
      <Dialog.Root open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose() }}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 bg-black/50 z-40" />
          <Dialog.Popup
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            aria-modal="true"
            aria-labelledby="turno-detail-title"
          >
            <div
              style={{
                background: 'var(--color-bg)',
                borderRadius: 12,
                boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
                width: '100%',
                maxWidth: 460,
                maxHeight: '90vh',
                overflowY: 'auto',
                padding: 24,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              {/* ── Título: nombre del paciente ── */}
              <Dialog.Title
                id="turno-detail-title"
                onClick={() => {
                  if (appointment?.patient_id) {
                    setDrawerOpen(true)
                  }
                }}
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  margin: 0,
                  cursor: appointment?.patient_id ? 'pointer' : 'default',
                  textDecoration: appointment?.patient_id ? 'underline' : 'none',
                }}
              >
                {patientName}
              </Dialog.Title>

              {/* ── Información del turno ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <p
                  className="capitalize"
                  style={{ fontSize: 14, color: 'var(--color-text-secondary)', margin: 0 }}
                >
                  {fechaHora}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <p style={{ fontSize: 14, color: 'var(--color-text-primary)', margin: 0 }}>
                    <span style={{ fontWeight: 500 }}>Servicio: </span>
                    {serviceName}
                  </p>
                  <p style={{ fontSize: 14, color: 'var(--color-text-primary)', margin: 0 }}>
                    <span style={{ fontWeight: 500 }}>Profesional: </span>
                    {professionalName}
                  </p>
                  {status && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 14,
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>Estado: </span>
                      <StatusDot variant={statusToVariant(status)} label={STATUS_LABELS[status]} />
                      <span>{STATUS_LABELS[status]}</span>
                    </div>
                  )}
                </div>

                {/* Badges: recordatorio + sesión serie */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  {appointment && (
                    <ReminderBadge
                      reminderSentAt={appointment.reminder_sent_at}
                      attendanceConfirmed={appointment.attendance_confirmed}
                    />
                  )}
                  {appointment && (
                    <SesionSerieBadge
                      sessionIndex={appointment.session_index}
                      totalSessions={appointment.treatments?.total_sessions}
                    />
                  )}
                </div>
              </div>

              {/* ── Color manual del turno (paleta muda del turnero, pedido ISADI) ── */}
              {appointment && (
                <ColorSwatchPicker
                  value={appointment.color ?? null}
                  onChange={(color) => {
                    // Elegir un color es la acción completa: si se guardó, el modal se cierra
                    // solo (si falla, queda abierto mostrando el error).
                    void actions.handleColorChange(appointment, color).then((saved) => {
                      if (saved) handleClose()
                    })
                  }}
                  disabled={actions.colorLoading}
                />
              )}
              {actions.colorError && (
                <p role="alert" className="text-xs text-red-600">
                  {actions.colorError}
                </p>
              )}

              {/* ── Evolución de la sesión (auto-gateado por rol) ── */}
              {appointment && (
                <SessionNotePanel
                  appointmentId={appointment.appointment_id}
                  sessionIndex={appointment.session_index}
                  totalSessions={appointment.treatments?.total_sessions}
                />
              )}

              {/* ── Confirmación inline de cancelación ── */}
              {actions.cancelTarget && (
                <CancelConfirmInline
                  patientName={patientName}
                  onConfirm={handleCancelConfirm}
                  onClose={() => { actions.setCancelTarget(null); actions.clearCancelError() }}
                  isLoading={actions.cancelLoading}
                  error={actions.cancelError}
                />
              )}

              {/* ── Acciones ── */}
              {!actions.cancelTarget && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    borderTop: '1px solid var(--color-border)',
                    paddingTop: 12,
                  }}
                >
                  {/* Ver ficha del paciente */}
                  {appointment?.patient_id && (
                    <Link
                      href={`/pacientes/${appointment.patient_id}`}
                      onClick={handleClose}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        padding: '10px 16px',
                        borderRadius: 8,
                        border: '1px solid var(--color-border)',
                        background: 'none',
                        fontSize: 14,
                        fontWeight: 500,
                        color: 'var(--color-interactive)',
                        textAlign: 'center',
                        textDecoration: 'none',
                        minHeight: 44,
                        boxSizing: 'border-box',
                      }}
                      aria-label={`Ver ficha de ${patientName}`}
                    >
                      Ver ficha del paciente
                    </Link>
                  )}

                  {/* Reprogramar */}
                  {!isCancelled && (
                    <button
                      type="button"
                      onClick={handleRescheduleClick}
                      style={{
                        width: '100%',
                        padding: '10px 16px',
                        borderRadius: 8,
                        border: 'none',
                        background: 'var(--color-interactive)',
                        cursor: 'pointer',
                        fontSize: 14,
                        fontWeight: 500,
                        color: 'white',
                        minHeight: 44,
                      }}
                      aria-label={`Reprogramar turno de ${patientName}`}
                    >
                      Reprogramar
                    </button>
                  )}

                  {/* Confirmar asistencia — solo si no está en estado terminal */}
                  {!isTerminal && (
                    <button
                      type="button"
                      onClick={() => void handleAttendanceClick('completed')}
                      disabled={actions.attendanceLoading}
                      style={{
                        width: '100%',
                        padding: '10px 16px',
                        borderRadius: 8,
                        border: '1px solid #22c55e',
                        background: 'none',
                        cursor: actions.attendanceLoading ? 'not-allowed' : 'pointer',
                        fontSize: 14,
                        fontWeight: 500,
                        color: '#22c55e',
                        minHeight: 44,
                        opacity: actions.attendanceLoading ? 0.6 : 1,
                      }}
                      aria-label={`Confirmar asistencia de ${patientName}`}
                    >
                      Confirmar asistencia
                    </button>
                  )}

                  {/* Marcar no-show — solo si no está en estado terminal */}
                  {!isTerminal && (
                    <button
                      type="button"
                      onClick={() => void handleAttendanceClick('no_show')}
                      disabled={actions.attendanceLoading}
                      style={{
                        width: '100%',
                        padding: '10px 16px',
                        borderRadius: 8,
                        border: '1px solid var(--color-border)',
                        background: 'none',
                        cursor: actions.attendanceLoading ? 'not-allowed' : 'pointer',
                        fontSize: 14,
                        fontWeight: 500,
                        color: 'var(--color-text-secondary)',
                        minHeight: 44,
                        opacity: actions.attendanceLoading ? 0.6 : 1,
                      }}
                      aria-label={`Marcar no-show a ${patientName}`}
                    >
                      Marcar no-show
                    </button>
                  )}

                  {/* Cancelar — solo si no está cancelado ya */}
                  {!isCancelled && (
                    <button
                      type="button"
                      onClick={handleCancelClick}
                      style={{
                        width: '100%',
                        padding: '10px 16px',
                        borderRadius: 8,
                        border: '1px solid #ef4444',
                        background: 'none',
                        cursor: 'pointer',
                        fontSize: 14,
                        fontWeight: 500,
                        color: '#ef4444',
                        minHeight: 44,
                      }}
                      aria-label={`Cancelar turno de ${patientName}`}
                    >
                      Cancelar turno
                    </button>
                  )}

                  {/* Cerrar */}
                  <Dialog.Close
                    aria-label="Cerrar detalle del turno"
                    onClick={handleClose}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      fontSize: 14,
                      fontWeight: 500,
                      color: 'var(--color-text-secondary)',
                      minHeight: 44,
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                  >
                    Cerrar
                  </Dialog.Close>
                </div>
              )}
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Diálogo de decisión para turnos de serie (se superpone al modal) */}
      {actions.absenceTarget && (
        <AbsenceDecisionDialog
          appointment={actions.absenceTarget.appointment}
          action={actions.absenceTarget.action}
          onConfirm={handleAbsenceConfirm}
          onClose={actions.clearAbsenceTarget}
          isLoading={actions.absenceLoading}
          error={actions.absenceError}
        />
      )}

      {appointment?.patient_id && (
        <PatientQuickDrawer
          patientId={appointment.patient_id}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </>
  )
}
