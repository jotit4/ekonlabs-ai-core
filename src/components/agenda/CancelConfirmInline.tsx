'use client'

// ── Confirmación inline de cancelación de turno ──────────────────────────────
// Extraído de TurnoDetailModal.tsx (Story D).
// Reutilizado en: TurnoDetailModal y ProximosTurnos (acción desde la Home).

export interface CancelConfirmInlineProps {
  patientName: string
  onConfirm: () => void
  onClose: () => void
  isLoading: boolean
  error: string | null
}

export function CancelConfirmInline({
  patientName,
  onConfirm,
  onClose,
  isLoading,
  error,
}: CancelConfirmInlineProps) {
  return (
    <div
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        padding: '12px 16px',
        background: 'var(--color-surface)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <p style={{ fontSize: 14, color: 'var(--color-text-primary)', fontWeight: 500 }}>
        ¿Cancelar el turno de {patientName}?
      </p>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
        Esta acción no se puede deshacer.
      </p>
      {error && (
        <p role="alert" style={{ fontSize: 13, color: '#ef4444' }}>
          {error}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={onClose}
          disabled={isLoading}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid var(--color-border)',
            background: 'none',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--color-text-primary)',
            minHeight: 44,
          }}
        >
          No, volver
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isLoading}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 8,
            border: 'none',
            background: '#ef4444',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            fontSize: 13,
            fontWeight: 500,
            color: 'white',
            minHeight: 44,
            opacity: isLoading ? 0.6 : 1,
          }}
        >
          {isLoading ? 'Cancelando...' : 'Sí, cancelar turno'}
        </button>
      </div>
    </div>
  )
}
