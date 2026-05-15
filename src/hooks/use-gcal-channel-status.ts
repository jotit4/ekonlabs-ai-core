'use client'

import { useState, useEffect } from 'react'

type GCalChannelStatus = 'healthy' | 'degraded' | 'unknown'

interface ChannelStatusResponse {
  status: GCalChannelStatus
}

export function useGCalChannelStatus(enabled = true): { status: GCalChannelStatus } {
  const [status, setStatus] = useState<GCalChannelStatus>('unknown')

  useEffect(() => {
    if (!enabled) return // No hacer fetch ni setear interval si está deshabilitado

    let cancelled = false

    async function fetchStatus() {
      try {
        const res = await fetch('/api/gcal/channel-status', {
          signal: AbortSignal.timeout(5000),
        })
        if (!cancelled && res.ok) {
          const data = await res.json() as ChannelStatusResponse
          setStatus(data.status)
        }
        // Si !res.ok: mantener estado anterior — no degradar UI por error de consulta
      } catch {
        // AbortError (timeout) o error de red — mantener estado anterior
      }
    }

    void fetchStatus() // fetch inicial inmediato

    const interval = setInterval(() => void fetchStatus(), 5 * 60 * 1000) // cada 5 min

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [enabled])

  return { status }
}
