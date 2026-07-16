'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Dialog } from '@base-ui/react/dialog'
import { MultiSessionScheduler } from '@/components/agenda/MultiSessionScheduler'
import { type SelectedSlot } from '@/components/agenda/AvailabilitySlotPicker'
import { ColorSwatchPicker } from '@/components/agenda/ColorSwatchPicker'

interface AgendarSesionModalProps {
  open: boolean
  onClose: () => void
  treatmentId: string
  serviceId: string
  /** Profesional FIJO del paquete, o null = "cualquier profesional disponible" (Pedido A #2/#3). */
  professionalId: string | null
  serviceName?: string | null
  professionalName?: string | null
  /** Cupo libre del bono (`por_agendar`). Tope de sesiones a elegir. */
  porAgendar: number
  patientId: string
  /**
   * Deuda técnica (parciales) — notifica al padre cuántas sesiones se crearon
   * en CADA intento de confirmación (incluidos los parciales), para que quien
   * embebe este modal pueda llevar su propio contador de "ya agendadas" sin
   * depender de un refetch (p. ej. `NewPaqueteModal` al reabrir este mismo
   * modal, para que el cupo mostrado descuente lo ya creado).
   */
  onScheduled?: (creadas: number) => void
}

// Motivo por el que el backend (RPC create_package_sessions, 054) saltea un
// slot — traducido a lenguaje llano para la recepción. `reason` puede además
// venir como mensaje libre de create_appointment (029, p. ej.
// "professional_service_mismatch: ..."); en ese caso mostramos el texto tal cual.
const SKIP_REASON_LABELS: Record<string, string> = {
  slot_conflict: 'ese horario ya estaba ocupado',
  no_capacity: 'se llenó el cupo del paquete',
  missing_professional: 'faltó asignar profesional',
  create_failed: 'no se pudo crear la sesión',
  link_error: 'error al vincular la sesión al paquete',
  treatment_not_found: 'el paquete ya no existe',
  treatment_not_active: 'el paquete ya no está activo',
}

function describeSkipReason(reason: string): string {
  return SKIP_REASON_LABELS[reason] ?? reason
}

// Agrupa los `skipped` por motivo y arma un resumen legible, p. ej.
// "1 ese horario ya estaba ocupado, 1 se llenó el cupo del paquete".
function summarizeSkipped(skipped: { reason: string }[]): string {
  const counts = new Map<string, number>()
  for (const item of skipped) {
    counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([reason, count]) => `${count} ${describeSkipReason(reason)}`)
    .join(', ')
}

// Modal "Agendar sesión" de un paquete — MANUAL Y FLEXIBLE (reclamo ISADI).
// Muestra la disponibilidad REAL del profesional+servicio del paquete (vía
// AvailabilitySlotPicker → useAvailability → RPC 029). Permite acumular VARIOS
// horarios (de a 1 o varios) y confirmarlos juntos. Al confirmar, POST al
// endpoint que crea los appointments con el camino estándar (RPC create_appointment
// + UPDATE package_id/session_index) y refresca el contador (deriva de appointments).
//
// Pedido A #2/#3 (ISADI 2026-07-14): si el bono NO tiene profesional fijo
// (`professionalId === null`), cada sesión se agenda con CUALQUIER profesional
// disponible del servicio — el `MultiSessionScheduler` pasa a modo "cualquiera"
// y cada slot elegido viaja con su propio `professional_id` al confirmar.
//
// Pedido 6 (ISADI 2026-07-14/16): color manual OPCIONAL de la TANDA completa —
// UN solo color por operación de agendado, aplicado a TODAS las sesiones que
// se crean acá (reusa `ColorSwatchPicker`, la misma paleta muda del turno
// único). Viaja como `color` a nivel de request (no por slot) al mismo
// endpoint; sin elegir ninguno, las sesiones se crean sin color (como hoy).

export function AgendarSesionModal({
  open,
  onClose,
  treatmentId,
  serviceId,
  professionalId,
  serviceName,
  porAgendar,
  patientId,
  onScheduled,
}: AgendarSesionModalProps) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<SelectedSlot[]>([])
  const [selectedColor, setSelectedColor] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // 201 PARCIAL (deuda técnica): aviso informativo — no es un error, algunas
  // sesiones sí se crearon. Separado de `submitError` para poder mostrarlo con
  // un tono distinto (ámbar, igual que los "pendientes" del propio scheduler).
  const [partialNotice, setPartialNotice] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSelectionChange = (slots: SelectedSlot[]) => {
    setSubmitError(null)
    setPartialNotice(null)
    setSelected(slots)
  }

  const reset = () => {
    setSelected([])
    setSelectedColor(null)
    setSubmitError(null)
    setPartialNotice(null)
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
    setPartialNotice(null)
    setIsSubmitting(true)
    const intentadas = selected.length
    try {
      const res = await fetch(
        `/api/treatments/${encodeURIComponent(treatmentId)}/sessions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slots: selected.map((s) => ({
              start_at: s.start_at,
              end_at: s.end_at,
              // Sin profesional fijo, cada sesión resuelve el suyo (del hueco elegido).
              ...(professionalId === null ? { professional_id: s.professional_id } : {}),
            })),
            // Color ÚNICO para TODA la tanda (Pedido 6) — sin elegir ninguno, no
            // se manda (las sesiones quedan sin color, como hoy).
            ...(selectedColor ? { color: selectedColor } : {}),
          }),
        },
      )

      if (res.status === 409) {
        // Ninguna sesión se pudo crear (todos los slots en conflicto o cupo
        // agotado). Refrescar para que la disponibilidad se recalcule y la
        // persona reelija.
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

      // 2xx — puede ser PARCIAL: `creadas` < slots enviados cuando `skipped`
      // trae elementos (deuda técnica corregida acá). Antes se ignoraba el
      // body y se cerraba el modal como éxito total siempre.
      const body = (await res.json().catch(() => ({}))) as {
        creadas?: number
        skipped?: { start_at?: string; reason: string }[]
      }
      const skipped = body.skipped ?? []
      const creadas = body.creadas ?? intentadas
      onScheduled?.(creadas)

      if (skipped.length === 0) {
        invalidateAfter()
        handleClose()
        return
      }

      // Parcial: mantenemos seleccionados SOLO los slots que quedaron en
      // `skipped` (matcheados por `start_at`, el único identificador que trae
      // el backend) para que la persona pueda reintentar sin perder el resto
      // de la elección. Si el backend no pudo identificar el/los slot(s)
      // puntuales (reasons de nivel-paquete, sin `start_at`), no filtramos —
      // más seguro mantener toda la elección visible que perderla.
      const skippedStarts = new Set(
        skipped.map((s) => s.start_at).filter((v): v is string => Boolean(v)),
      )
      const stillPending = selected.filter((s) => skippedStarts.has(s.start_at))
      setSelected(stillPending.length > 0 ? stillPending : selected)
      invalidateAfter()
      setSubmitError(null)
      setPartialNotice(
        `Se agendaron ${creadas} de ${intentadas} sesiones. Faltan ${skipped.length}: ${summarizeSkipped(skipped)}. Revisá y confirmá de nuevo.`,
      )
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
                {' — faltan agendar '}
                {porAgendar}
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

              {/* Color manual OPCIONAL de la tanda (Pedido 6 ISADI 2026-07-14/16):
                  UN solo color para TODAS las sesiones que se agenden acá. */}
              <ColorSwatchPicker
                value={selectedColor}
                onChange={setSelectedColor}
                label="Color para todas las sesiones de este paquete"
              />

              {submitError && (
                <p role="alert" className="text-sm text-red-600">
                  {submitError}
                </p>
              )}

              {/* 201 parcial: aviso informativo (no rojo — sí se agendó algo). */}
              {partialNotice && (
                <p role="status" className="text-sm text-amber-700">
                  {partialNotice}
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
