'use client'

import { useEffect } from 'react'

export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error('[Dashboard Error Boundary]', error)
  }, [error])

  return (
    <main
      id="main-content"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <p
        style={{
          fontSize: 16,
          color: 'var(--color-text-primary)',
          fontWeight: 500,
        }}
      >
        Ocurrió un error inesperado
      </p>
      {error.digest && (
        <p
          style={{
            fontSize: 12,
            color: 'var(--color-text-secondary)',
          }}
        >
          Código de referencia: {error.digest}
        </p>
      )}
      <button
        onClick={() => unstable_retry()}
        style={{
          background: 'var(--color-interactive)',
          color: '#ffffff',
          border: 'none',
          borderRadius: 'var(--radius-sm, 6px)',
          padding: '10px 20px',
          fontSize: 14,
          cursor: 'pointer',
          minHeight: 44,
        }}
      >
        Reintentar
      </button>
    </main>
  )
}
