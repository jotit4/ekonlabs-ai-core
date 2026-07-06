'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Dialog } from '@base-ui/react/dialog'
import { MultiSessionScheduler } from '@/components/agenda/MultiSessionScheduler'
import { type SelectedSlot } from '@/components/agenda/AvailabilitySlotPicker'

interface AgendarSesionModalProps {
  open: boolean
  onClose: () => void
  treatmentId: string
  serviceId: string
  professionalId: string
  serviceName?: string | null
  professionalName?: string | null
  /** Cupo libre del bono (`por_agendar`). Tope de sesiones a elegir. */
  porAgendar: number
  patientId: string
}

// Modal "Agendar sesión" de un paquete — MANUAL Y FLEXIBLE (reclamo ISADI).
// Muestra la disponibilidad REAL del profesional+servicio del paquete (vía
// AvailabilitySlotPicker → useAvailability → RPC 029). Permite acumular VARIOS
// horarios (de a 1 o varios) y confirmarlos juntos. Al confirmar, POST al
// endpoint que crea los appointments con el camino estándar (RPC create_appointment
// + UPDATE package_id/session_index) y refresca el contador (deriva de appointments).

export function AgendarSesionModal({
  open,
  onClose,
  treatmentId,
  serviceId,
  professionalId,
  serviceName,
  professionalName,
  porAgendar,
  patientId,
}: AgendarSesionModalProps) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<SelectedSlot[]>([])
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSelectionChange = (slots: SelectedSlot[]) => {
    setSubmitError(null)
    setSelected(slots)
  }

  const reset = () => {
    setSelected([])
    setSubmitError(null)
    setIsSubmitting(false)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const invalidateAfter = () => {
    // El contador deriva de los appointments → invalidar treatments (tracking),
    // la ficha del paciente, la agenda y la disponibilidad.
    queryClient.invalidateQueries({ queryKey: ['treatments'], exact: false })
    queryClient.invalidateQueries({ queryKey: ['patients', 'one', patientId] })
    queryClient.invalidateQueries({ queryKey: ['agenda'], exact: false })
    queryClient.invalidateQueries({ queryKey: ['appointments'], exact: false })
    queryClient.invalidateQueries({ queryKey: ['availability'], exact: false })
  }

  const handleConfirm = async () => {
    if (selected.length === 0) return
    setSubmitError(null)
    setIsSubmitting(true)
    try {
      const res = await fetch(
        `/api/treatments/${encodeURIComponent(treatmentId)}/sessions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slots: selected.map((s) => ({ start_at: s.start_at, end_at: s.end_at })),
          }),
        },
      )

      if (res.status === 409) {
        // Alguno (o todos) los horarios ya no están disponibles. Refrescar para
        // que la disponibilidad se recalcule y la persona reelija.
        invalidateAfter()
        setSubmitError('Alguno de esos horarios ya no está disponible. Revisá la disponibilidad y elegí de nuevo.')
        setSelected([])
        return
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setSubmitError((body as { error?: string }).error ?? 'No se pudieron agendar las sesiones')
        return
      }

      await res.json().catch(() => ({}))
      invalidateAfter()
      handleClose()
    } catch {
      setSubmitError('Error de red. Verificá tu conexión e intentá de nuevo.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose() }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/50 z-40" data-testid="dialog-backdrop" />
        <Dialog.Popup
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          aria-modal="true"
          aria-labelledby="agendar-sesion-title"
        >
          <div className="bg-[var(--color-bg)] rounded-[12px] shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-[var(--color-border)]">
              <Dialog.Title
                id="agendar-sesion-title"
                className="text-lg font-semibold text-[var(--color-text-primary)]"
              >
                Agendar sesión
              </Dialog.Title>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                {serviceName ?? 'Servicio'}
                {professionalName ? ` · ${professionalName}` : ''} — faltan agendar {porAgendar}
              </p>
            </div>

            {/* Body */}
            <div className="px-6 py-4 space-y-4">
              <MultiSessionScheduler
                serviceId={serviceId}
                professionalId={professionalId}
                total={porAgendar}
                selected={selected}
                onChange={handleSelectionChange}
              />

              {submitError && (
                <p role="alert" className="text-sm text-red-600">
                  {submitError}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 pt-2 flex justify-end gap-3 border-t border-[var(--color-border)]">
              <Dialog.Close
                onClick={handleClose}
                className="px-4 py-2 rounded-[8px] text-sm font-medium min-h-[44px] text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] transition-colors"
              >
                Cancelar
              </Dialog.Close>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={selected.length === 0 || isSubmitting}
                className={[
                  'px-4 py-2 rounded-[8px] text-sm font-medium min-h-[44px]',
                  'bg-[var(--color-interactive)] text-white hover:opacity-90 transition-opacity',
                  selected.length === 0 || isSubmitting ? 'opacity-50 cursor-not-allowed' : '',
                ].join(' ')}
              >
                {isSubmitting
                  ? 'Agendando...'
                  : selected.length > 1
                    ? `Agendar ${selected.length} sesiones`
                    : 'Agendar sesión'}
              </button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
