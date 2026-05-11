'use client'

import { useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'

interface PatientDeletionRequestProps {
  patientId: string
  patientName: string
  patientDni: string | null
  onSuccess: () => void
}

export function PatientDeletionRequest({
  patientId,
  patientName,
  patientDni,
  onSuccess,
}: PatientDeletionRequestProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/patients/${patientId}/deletion-request`, {
        method: 'POST',
      })
      const data = await res.json() as { error?: string; success?: boolean }
      if (!res.ok) {
        setError(data.error ?? 'Error al procesar la solicitud')
        setSubmitting(false)
        return
      }
      setDialogOpen(false)
      onSuccess()
    } catch {
      setError('Error de conexión. Intentá de nuevo.')
      setSubmitting(false)
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!submitting) {
      setDialogOpen(open)
      if (!open) setError(null)
    }
  }

  return (
    <Dialog.Root open={dialogOpen} onOpenChange={handleOpenChange}>
      <Dialog.Trigger
        style={{
          padding: '6px 14px',
          borderRadius: 8,
          background: 'none',
          border: '1px solid rgba(255,59,48,0.4)',
          color: 'var(--color-error, #ff3b30)',
          fontSize: 14,
          cursor: 'pointer',
          minHeight: 44,
          fontWeight: 400,
        }}
      >
        Solicitar eliminación
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Backdrop
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            zIndex: 40,
          }}
        />
        <Dialog.Popup
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 50,
            width: '90vw',
            maxWidth: 480,
            backgroundColor: 'var(--color-surface, #fff)',
            borderRadius: 12,
            padding: '24px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
          }}
        >
          <Dialog.Title style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            Solicitar eliminación de paciente
          </Dialog.Title>

          <p style={{ fontSize: 15, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
            Esta acción marcará al paciente para su eliminación definitiva en 30 días.
          </p>

          {/* Datos del paciente — requiere confirmación explícita */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 8,
              backgroundColor: '#f5f5f7',
              marginBottom: 16,
            }}
          >
            <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>{patientName}</p>
            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
              DNI: {patientDni ?? '—'}
            </p>
          </div>

          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 20 }}>
            Durante el período de gracia (30 días), la ficha quedará en modo lectura. Tras ese
            período el sistema procesará la eliminación definitiva automáticamente.
          </p>

          {/* Error inline — visible si falla el POST */}
          {error && (
            <p
              role="alert"
              style={{ fontSize: 14, color: 'var(--color-error, #ff3b30)', marginBottom: 12 }}
            >
              {error}
            </p>
          )}

          {/* Footer right-aligned */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Dialog.Close
              disabled={submitting}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                background: 'none',
                border: '1px solid rgba(0,0,0,0.15)',
                fontSize: 14,
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.4 : 1,
                minHeight: 44,
              }}
            >
              Cancelar
            </Dialog.Close>
            <button
              onClick={() => void handleConfirm()}
              disabled={submitting}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                background: 'none',
                border: '1px solid rgba(255,59,48,0.6)',
                color: 'var(--color-error, #ff3b30)',
                fontSize: 14,
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.4 : 1,
                minHeight: 44,
                fontWeight: 500,
              }}
            >
              {submitting ? 'Solicitando...' : 'Confirmar eliminación'}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
