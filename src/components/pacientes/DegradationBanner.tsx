'use client'

export function DegradationBanner() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        padding: '12px 16px',
        background: 'rgba(255, 159, 10, 0.1)',
        border: '1px solid rgba(255, 159, 10, 0.3)',
        borderRadius: 8,
        fontSize: 14,
        color: 'var(--color-text-primary)',
      }}
    >
      Chatwoot no disponible temporalmente. Los mensajes no pueden cargarse ahora.
    </div>
  )
}
