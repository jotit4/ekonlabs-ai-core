'use client'

import { useQuery } from '@tanstack/react-query'
import type { EntidadConPlanes } from '@/app/api/obras-sociales/route'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ObraSocialSelection {
  entidad: string
  plan: string
}

interface Props {
  value: ObraSocialSelection | null
  onChange: (val: ObraSocialSelection | null) => void
  disabled?: boolean
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const selectClassName = [
  'w-full px-3 py-2 rounded-[8px] border text-sm',
  'bg-[var(--color-bg)] text-[var(--color-text-primary)]',
  'focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]',
  'border-[var(--color-border)]',
].join(' ')

// ─── Componente ───────────────────────────────────────────────────────────────

export function ObraSocialSelector({ value, onChange, disabled }: Props) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['obras-sociales', 'list'],
    queryFn: async () => {
      const res = await fetch('/api/obras-sociales')
      if (!res.ok) throw new Error('Error al cargar obras sociales')
      return res.json() as Promise<{ entidades: EntidadConPlanes[] }>
    },
    staleTime: 5 * 60 * 1000,
  })

  const entidades = data?.entidades ?? []
  const selectedEntidad = value?.entidad ?? ''
  const planesDisponibles = entidades.find(e => e.entidad === selectedEntidad)?.planes ?? []

  const handleEntidadChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newEntidad = e.target.value
    if (!newEntidad) {
      onChange(null)
    } else {
      onChange({ entidad: newEntidad, plan: '' })
    }
  }

  const handlePlanChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newPlan = e.target.value
    onChange({ entidad: selectedEntidad, plan: newPlan })
  }

  if (isPending) {
    return (
      <div className="space-y-2">
        <select disabled aria-label="Obra social" className={selectClassName}>
          <option>Cargando...</option>
        </select>
        <select disabled aria-label="Plan de cobertura" className={selectClassName}>
          <option>Cargando...</option>
        </select>
      </div>
    )
  }

  if (isError) {
    return (
      <div role="alert" className="text-sm text-red-600">
        Error al cargar obras sociales.{' '}
        <button type="button" onClick={() => refetch()} className="underline">
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <select
        aria-label="Obra social"
        value={selectedEntidad}
        onChange={handleEntidadChange}
        disabled={disabled}
        className={selectClassName}
      >
        <option value="">Seleccioná obra social</option>
        {entidades.map(e => (
          <option key={e.entidad} value={e.entidad}>{e.entidad}</option>
        ))}
      </select>

      {selectedEntidad && planesDisponibles.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)]">
          No hay planes activos para esta obra social
        </p>
      ) : (
        <select
          aria-label="Plan de cobertura"
          value={value?.plan ?? ''}
          onChange={handlePlanChange}
          disabled={disabled || !selectedEntidad}
          className={selectClassName}
        >
          <option value="">Seleccioná plan</option>
          {planesDisponibles.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      )}
    </div>
  )
}
