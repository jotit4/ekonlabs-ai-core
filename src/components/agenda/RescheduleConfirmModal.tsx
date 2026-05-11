'use client'

import { Dialog } from '@base-ui/react/dialog'

interface RescheduleConfirmModalProps {
  open: boolean
  patientName: string
  originalTime: string
  newTime: string
  onConfirm: () => void
  onCancel: () => void
  isSubmitting: boolean
}

export function RescheduleConfirmModal({
  open,
  patientName,
  originalTime,
  newTime,
  onConfirm,
  onCancel,
  isSubmitting,
}: RescheduleConfirmModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel() }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/50 z-40" />
        <Dialog.Popup
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          aria-modal="true"
          aria-labelledby="reschedule-confirm-title"
        >
          <div className="bg-[var(--color-bg)] rounded-[12px] shadow-xl w-full max-w-sm p-6 space-y-5">
            <Dialog.Title
              id="reschedule-confirm-title"
              className="text-lg font-semibold text-[var(--color-text-primary)]"
            >
              Reprogramar turno
            </Dialog.Title>

            <p className="text-sm text-[var(--color-text-primary)]">
              ¿Reprogramar turno de{' '}
              <span className="font-medium">{patientName}</span>{' '}
              de{' '}
              <span className="font-medium">{originalTime}</span>{' '}
              a{' '}
              <span className="font-medium">{newTime}</span>?
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={isSubmitting}
                className={[
                  'px-4 py-2 rounded-[8px] text-sm font-medium min-h-[44px]',
                  'text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] transition-colors',
                  isSubmitting ? 'opacity-50 cursor-not-allowed' : '',
                ].join(' ')}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={isSubmitting}
                className={[
                  'px-4 py-2 rounded-[8px] text-sm font-medium min-h-[44px]',
                  'bg-[var(--color-interactive)] text-white',
                  'hover:opacity-90 transition-opacity',
                  isSubmitting ? 'opacity-50 cursor-not-allowed' : '',
                ].join(' ')}
              >
                {isSubmitting ? 'Confirmando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
