'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error('[Global Error Boundary]', error)
  }, [error])

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          flexDirection: 'column',
          gap: '16px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: '#000000',
          color: '#f5f5f7',
        }}
      >
        <p style={{ fontSize: 18, fontWeight: 600 }}>
          Ocurrió un error inesperado
        </p>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.56)' }}>
          Por favor recargá la página o intentá de nuevo.
        </p>
        <button
          onClick={() => unstable_retry()}
          style={{
            background: '#0071e3',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            padding: '10px 20px',
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Reintentar
        </button>
      </body>
    </html>
  )
}
