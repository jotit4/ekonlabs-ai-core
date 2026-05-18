'use client'

import { useEffect, useState } from 'react'
import { ProfessionalScheduleView } from '@/components/profesionales/ProfessionalScheduleView'
import { BlockedTimesView } from '@/components/profesionales/BlockedTimesView'

type ProfessionalData = {
  professional_id: string
  professional_name: string
}

type State =
  | { status: 'loading' }
  | { status: 'not-assigned' }
  | { status: 'error' }
  | { status: 'ready'; data: ProfessionalData }

export function MiDisponibilidadView() {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    fetch('/api/me/professional')
      .then(async (res) => {
        if (res.status === 404) {
          setState({ status: 'not-assigned' })
          return
        }
        if (!res.ok) {
          setState({ status: 'error' })
          return
        }
        const json = await res.json()
        setState({ status: 'ready', data: json.data })
      })
      .catch(() => setState({ status: 'error' }))
  }, [])

  if (state.status === 'loading') {
    return (
      <div
        role="status"
        aria-label="Cargando disponibilidad"
        className="animate-pulse space-y-4"
        data-testid="mi-disponibilidad-loading"
      >
        <div className="h-48 bg-[var(--color-surface)] rounded-[8px]" />
        <div className="h-36 bg-[var(--color-surface)] rounded-[8px]" />
      </div>
    )
  }

  if (state.status === 'not-assigned') {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 py-12 text-[var(--color-text-secondary)]"
        data-testid="mi-disponibilidad-not-assigned"
      >
        <p className="text-sm text-center">
          Tu cuenta aún no tiene un profesional asignado. Contactá al administrador.
        </p>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 py-12 text-[var(--color-text-secondary)]"
        data-testid="mi-disponibilidad-error"
      >
        <p className="text-sm text-center">
          No se pudo cargar tu disponibilidad. Intentá de nuevo más tarde.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6" data-testid="mi-disponibilidad-view">
      <ProfessionalScheduleView
        professionalId={state.data.professional_id}
        professionalName={state.data.professional_name}
      />
      <BlockedTimesView
        professionalId={state.data.professional_id}
        professionalName={state.data.professional_name}
      />
    </div>
  )
}
