'use client'

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Dialog } from '@base-ui/react/dialog'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useAppointmentActions } from '@/hooks/use-appointment-actions'
import { AbsenceDecisionDialog } from '@/components/agenda/AbsenceDecisionDialog'
import type { Appointment } from '@/types/appointments'

interface PatientQuickDrawerProps {
  patientId: string
  open: boolean
  onClose: () => void
}

export function PatientQuickDrawer({ patientId, open, onClose }: PatientQuickDrawerProps) {
  const queryClient = useQueryClient()

  // Form states
  const [dni, setDni] = useState('')
  const [obraSocial, setObraSocial] = useState('')
  const [initialDni, setInitialDni] = useState('')
  const [initialObraSocial, setInitialObraSocial] = useState('')

  // Control states
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)

  // Data states
  const [patient, setPatient] = useState<any>(null)
  const [treatments, setTreatments] = useState<any[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [isLoadingPatient, setIsLoadingPatient] = useState(false)
  const [isLoadingTreatments, setIsLoadingTreatments] = useState(false)
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(false)

  // Load Patient, Treatments, and Appointments Data
  const loadData = () => {
    if (!patientId || !open) return

    setIsLoadingPatient(true)
    setIsLoadingTreatments(true)
    setIsLoadingAppointments(true)

    const supabase = createSupabaseBrowserClient()

    // 1. Fetch patient
    supabase
      .from('patients')
      .select('patient_id, full_name, dni, obra_social, phone_number')
      .eq('patient_id', patientId)
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          setPatient(data)
          setDni(data.dni ?? '')
          setObraSocial(data.obra_social ?? '')
          setInitialDni(data.dni ?? '')
          setInitialObraSocial(data.obra_social ?? '')
        }
        setIsLoadingPatient(false)
      })

    // 2. Fetch treatments
    supabase
      .from('treatments')
      .select('treatment_id, total_sessions, sessions_remaining, status, services(name)')
      .eq('patient_id', patientId)
      .eq('status', 'active')
      .then(({ data, error }) => {
        if (!error && data) {
          setTreatments(data)
        }
        setIsLoadingTreatments(false)
      })

    // 3. Fetch upcoming appointments
    supabase
      .from('appointments')
      .select(`
        appointment_id,
        patient_id,
        service_id,
        start_at,
        end_at,
        status,
        package_id,
        session_index,
        reminder_sent_at,
        attendance_confirmed,
        patients(full_name),
        services(name),
        professionals(name),
        treatments(total_sessions, status)
      `)
      .eq('patient_id', patientId)
      .in('status', ['confirmed', 'pending', 'pending_calendar'])
      .gte('start_at', new Date().toISOString())
      .order('start_at', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) {
          setAppointments(data as unknown as Appointment[])
        }
        setIsLoadingAppointments(false)
      })
  }

  useEffect(() => {
    if (open && patientId) {
      loadData()
    }
  }, [patientId, open])

  useEffect(() => {
    if (!open) {
      setShowDiscardConfirm(false)
      setSaveError(null)
    }
  }, [open])

  const isDirty = dni !== initialDni || obraSocial !== initialObraSocial

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      if (isDirty) {
        setShowDiscardConfirm(true)
      } else {
        onClose()
      }
    }
  }

  const handleCloseClick = () => {
    if (isDirty) {
      setShowDiscardConfirm(true)
    } else {
      onClose()
    }
  }

  const handleConfirmDiscard = () => {
    setDni(initialDni)
    setObraSocial(initialObraSocial)
    setShowDiscardConfirm(false)
    onClose()
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaveError(null)

    if (dni && !/^\d{7,8}$/.test(dni)) {
      setSaveError('DNI inválido — debe tener 7 u 8 dígitos')
      return
    }

    setIsSaving(true)
    try {
      const response = await fetch(`/api/patients/${patientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: patient?.full_name,
          phone_number: patient?.phone_number,
          dni: dni || '',
          obra_social: obraSocial || '',
        }),
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error ?? 'Error al actualizar los datos')
      }

      const resData = await response.json()
      const updatedPatient = resData.patient
      setInitialDni(updatedPatient.dni ?? '')
      setInitialObraSocial(updatedPatient.obra_social ?? '')
      setDni(updatedPatient.dni ?? '')
      setObraSocial(updatedPatient.obra_social ?? '')

      // Invalidate queries
      await queryClient.invalidateQueries({ queryKey: ['patients', 'one', patientId] })
      await queryClient.invalidateQueries({ queryKey: ['patients', 'list'] })
      await queryClient.invalidateQueries({ queryKey: ['agent-context'] })

      toast.success('Datos actualizados correctamente')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error al guardar los cambios')
    } finally {
      setIsSaving(false)
    }
  }

  // Hook for appointment actions (like marking absence)
  // Use today's date for query invalidation
  const actions = useAppointmentActions(new Date().toISOString().slice(0, 10))

  const handleAbsenceClick = async (appt: Appointment) => {
    await actions.handleAttendanceSelect(appt, 'no_show')
    if (!appt.package_id) {
      loadData()
    }
  }

  const handleAbsenceConfirm = async (decision: any, note?: string) => {
    await actions.handleAbsenceConfirm(decision, note)
    loadData()
  }

  return (
    <>
      <Dialog.Root open={open} onOpenChange={handleOpenChange}>
        <Dialog.Portal>
          <Dialog.Backdrop
            className="fixed inset-0 bg-black/50 z-40 transition-opacity"
            data-testid="drawer-backdrop"
          />
          <Dialog.Popup
            className="fixed top-0 right-0 h-full w-full max-w-md bg-[var(--color-bg)] border-l border-[var(--color-border)] shadow-2xl z-50 flex flex-col focus:outline-none overflow-y-auto"
            aria-modal="true"
            aria-labelledby="patient-drawer-title"
          >
            {/* Drawer Header */}
            <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
              <div>
                <Dialog.Title
                  id="patient-drawer-title"
                  className="text-lg font-semibold text-[var(--color-text-primary)]"
                >
                  {isLoadingPatient ? 'Cargando...' : patient?.full_name ?? 'Ficha Rápida'}
                </Dialog.Title>
                <p className="text-xs text-[var(--color-text-secondary)]">Ficha rápida de paciente</p>
              </div>
              <button
                type="button"
                onClick={handleCloseClick}
                aria-label="Cerrar ficha"
                className="p-2 hover:bg-[var(--color-surface)] rounded-md text-[var(--color-text-secondary)] transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 p-6 flex flex-col gap-6">
              {isLoadingPatient ? (
                <div className="flex items-center justify-center py-12">
                  <p className="text-sm text-[var(--color-text-secondary)]">Cargando datos del paciente...</p>
                </div>
              ) : (
                <form onSubmit={handleSave} className="flex flex-col gap-4">
                  <div>
                    <label
                      htmlFor="patient-dni-input"
                      className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1"
                    >
                      DNI
                    </label>
                    <input
                      id="patient-dni-input"
                      type="text"
                      value={dni}
                      onChange={(e) => setDni(e.target.value)}
                      className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md bg-[var(--color-bg)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)] text-sm"
                      placeholder="Ingrese DNI"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="patient-os-input"
                      className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1"
                    >
                      Obra Social
                    </label>
                    <input
                      id="patient-os-input"
                      type="text"
                      value={obraSocial}
                      onChange={(e) => setObraSocial(e.target.value)}
                      className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md bg-[var(--color-bg)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)] text-sm"
                      placeholder="Ingrese Obra Social"
                    />
                  </div>

                  {saveError && (
                    <p className="text-xs text-red-500 font-medium" role="alert">
                      {saveError}
                    </p>
                  )}

                  <div className="flex justify-end gap-3 mt-2">
                    {isDirty && (
                      <button
                        type="button"
                        onClick={handleConfirmDiscard}
                        className="px-4 py-2 border border-[var(--color-border)] rounded-md text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] transition-colors"
                      >
                        Descartar
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={isSaving || !isDirty}
                      className="px-4 py-2 bg-[var(--color-interactive)] text-white rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isSaving ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </form>
              )}

              {/* Progress Bars for Active Packages */}
              <div className="border-t border-[var(--color-border)] pt-6">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">
                  Paquetes Activos
                </h3>
                {isLoadingTreatments ? (
                  <p className="text-xs text-[var(--color-text-secondary)]">Cargando paquetes...</p>
                ) : !treatments || treatments.length === 0 ? (
                  <p className="text-xs text-[var(--color-text-secondary)]">No hay paquetes activos.</p>
                ) : (
                  <div className="flex flex-col gap-4">
                    {treatments.map((t) => {
                      const serviceName = (t.services as any)?.name ?? 'Servicio'
                      const pct = t.total_sessions > 0 ? (t.sessions_remaining / t.total_sessions) * 100 : 0
                      return (
                        <div
                          key={t.treatment_id}
                          className="border border-[var(--color-border)] rounded-lg p-3 bg-[var(--color-surface)] flex flex-col gap-2"
                        >
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-semibold text-[var(--color-text-primary)]">{serviceName}</span>
                            <span className="text-[var(--color-text-secondary)]">
                              {t.sessions_remaining} de {t.total_sessions} restantes
                            </span>
                          </div>
                          <div className="w-full h-2 bg-[var(--color-border)] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[var(--color-interactive)] transition-all duration-300"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Upcoming Appointments */}
              <div className="border-t border-[var(--color-border)] pt-6 mb-6">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">
                  Próximos Turnos
                </h3>
                {isLoadingAppointments ? (
                  <p className="text-xs text-[var(--color-text-secondary)]">Cargando próximos turnos...</p>
                ) : !appointments || appointments.length === 0 ? (
                  <p className="text-xs text-[var(--color-text-secondary)]">No hay próximos turnos agendados.</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {appointments.map((appt) => {
                      const dateStr = format(parseISO(appt.start_at), "EEEE d 'de' MMMM 'a las' HH:mm", { locale: es })
                      const svcName = appt.services?.name ?? 'Servicio'
                      const profName = appt.professionals?.name ?? 'Sin asignar'
                      return (
                        <div
                          key={appt.appointment_id}
                          className="border border-[var(--color-border)] rounded-lg p-3 flex flex-col gap-3 bg-[var(--color-bg)]"
                        >
                          <div>
                            <p className="text-xs font-semibold text-[var(--color-text-primary)] capitalize">
                              {dateStr}
                            </p>
                            <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                              {svcName} · {profName}
                            </p>
                          </div>
                          <div className="flex justify-end border-t border-[var(--color-border)] pt-2">
                            <button
                              type="button"
                              onClick={() => void handleAbsenceClick(appt)}
                              className="text-xs font-medium text-red-500 border border-red-500 rounded px-2 py-1 hover:bg-red-50 transition-colors cursor-pointer"
                            >
                              Marcar inasistencia
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Discard Confirmation Dialog */}
      <Dialog.Root open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 bg-black/50 z-[60]" />
          <Dialog.Popup
            className="fixed inset-0 z-[70] flex items-center justify-center p-4"
            aria-modal="true"
            aria-labelledby="discard-confirm-title"
          >
            <div className="bg-[var(--color-bg)] rounded-lg shadow-xl w-full max-w-sm p-6 flex flex-col gap-4 border border-[var(--color-border)]">
              <Dialog.Title
                id="discard-confirm-title"
                className="text-base font-semibold text-[var(--color-text-primary)]"
              >
                ¿Querés descartar los cambios sin guardar?
              </Dialog.Title>
              <div className="flex justify-end gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setShowDiscardConfirm(false)}
                  className="px-4 py-2 border border-[var(--color-border)] rounded-md text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] transition-colors"
                >
                  Seguir editando
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDiscard}
                  className="px-4 py-2 bg-red-500 text-white rounded-md text-sm font-medium hover:bg-red-600 transition-colors"
                >
                  Descartar
                </button>
              </div>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Absence Decision Dialog (for Series) */}
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
    </>
  )
}
