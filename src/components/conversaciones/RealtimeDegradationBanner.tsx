'use client'

export function RealtimeDegradationBanner() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        padding: '10px 16px',
        background: 'rgba(255, 159, 10, 0.1)',
        border: '1px solid rgba(255, 159, 10, 0.3)',
        borderRadius: 8,
        fontSize: 13,
        color: 'var(--color-text-primary)',
        margin: '8px 0',
      }}
    >
      Actualizaciones en tiempo real desconectadas. Recargá para ver cambios recientes.
    </div>
  )
}
