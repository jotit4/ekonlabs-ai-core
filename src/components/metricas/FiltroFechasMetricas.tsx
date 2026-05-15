'use client'

import { useState } from 'react'
import { startOfMonth, subDays, startOfDay } from 'date-fns'
import { toZonedTime, formatInTimeZone } from 'date-fns-tz'

const TZ = 'America/Argentina/Buenos_Aires'

type PeriodoPredef = 'este-mes' | 'ultimos-7' | 'ultimos-30' | 'ultimo-trimestre' | 'personalizado'

export interface FiltroFechasMetricasProps {
  periodoDesde: string
  periodoHasta: string
  esRangoPorDefecto: boolean
  onAplicar: (desde: string, hasta: string) => void
  onLimpiar: () => void
}

function toISO(date: Date): string {
  return formatInTimeZone(date, TZ, "yyyy-MM-dd'T'HH:mm:ssxxx")
}

function calcularRango(periodo: PeriodoPredef): { desde: string; hasta: string } | null {
  const ahora = new Date()
  const ahoraArg = toZonedTime(ahora, TZ)

  switch (periodo) {
    case 'este-mes': {
      const inicioMes = startOfMonth(ahoraArg)
      return { desde: toISO(inicioMes), hasta: toISO(ahora) }
    }
    case 'ultimos-7': {
      const hace7 = startOfDay(toZonedTime(subDays(ahora, 7), TZ))
      return { desde: toISO(hace7), hasta: toISO(ahora) }
    }
    case 'ultimos-30': {
      const hace30 = startOfDay(toZonedTime(subDays(ahora, 30), TZ))
      return { desde: toISO(hace30), hasta: toISO(ahora) }
    }
    case 'ultimo-trimestre': {
      const hace90 = startOfDay(toZonedTime(subDays(ahora, 90), TZ))
      return { desde: toISO(hace90), hasta: toISO(ahora) }
    }
    case 'personalizado':
      return null // Esperará inputs manuales
  }
}

const inputStyle: React.CSSProperties = {
  minHeight: '44px',
  padding: '0 12px',
  border: '1px solid var(--color-border)',
  borderRadius: '8px',
  background: 'var(--color-bg)',
  color: 'var(--color-text-primary)',
  fontSize: '14px',
  outline: 'none',
  cursor: 'pointer',
}

const buttonPrimaryStyle: React.CSSProperties = {
  minHeight: '44px',
  padding: '0 16px',
  border: 'none',
  borderRadius: '8px',
  background: 'var(--color-interactive)',
  color: '#ffffff',
  fontSize: '14px',
  cursor: 'pointer',
  fontWeight: 500,
}

const buttonSecondaryStyle: React.CSSProperties = {
  minHeight: '44px',
  padding: '0 16px',
  border: '1px solid var(--color-border)',
  borderRadius: '8px',
  background: 'transparent',
  color: 'var(--color-interactive)',
  fontSize: '14px',
  cursor: 'pointer',
  fontWeight: 500,
}

export function FiltroFechasMetricas({
  esRangoPorDefecto,
  onAplicar,
  onLimpiar,
}: FiltroFechasMetricasProps) {
  const [periodoSeleccionado, setPeriodoSeleccionado] = useState<PeriodoPredef>(
    esRangoPorDefecto ? 'este-mes' : 'personalizado'
  )
  const [desdeCustom, setDesdeCustom] = useState('') // YYYY-MM-DD (para input type="date")
  const [hastaCustom, setHastaCustom] = useState('')
  const [errorFecha, setErrorFecha] = useState<string | null>(null)

  function handleSelectPeriodo(p: PeriodoPredef) {
    setPeriodoSeleccionado(p)
    setErrorFecha(null)
    if (p !== 'personalizado') {
      const rango = calcularRango(p)
      if (rango) onAplicar(rango.desde, rango.hasta)
    }
  }

  function handleAplicarPersonalizado() {
    if (!desdeCustom || !hastaCustom) {
      setErrorFecha('Seleccioná ambas fechas')
      return
    }
    const desde = new Date(desdeCustom + 'T00:00:00-03:00')
    const hasta = new Date(hastaCustom + 'T23:59:59-03:00')
    if (desde > hasta) {
      setErrorFecha('La fecha de inicio no puede ser posterior a la fecha de fin')
      return
    }
    setErrorFecha(null)
    onAplicar(toISO(desde), toISO(hasta))
  }

  return (
    <div
      role="search"
      aria-label="Filtro de período de métricas"
      className="flex flex-wrap items-end gap-3 mb-6 p-4 rounded-[var(--radius-md)] bg-[var(--color-surface)] border border-[var(--color-border)]"
    >
      {/* Selector de período predefinido */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="metricas-periodo"
          style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 500 }}
        >
          Período
        </label>
        <select
          id="metricas-periodo"
          aria-label="Seleccionar período"
          value={periodoSeleccionado}
          onChange={(e) => handleSelectPeriodo(e.target.value as PeriodoPredef)}
          style={inputStyle}
        >
          <option value="este-mes">Este mes</option>
          <option value="ultimos-7">Últimos 7 días</option>
          <option value="ultimos-30">Últimos 30 días</option>
          <option value="ultimo-trimestre">Último trimestre</option>
          <option value="personalizado">Personalizado</option>
        </select>
      </div>

      {/* Inputs de fecha — solo visibles en modo personalizado */}
      {periodoSeleccionado === 'personalizado' && (
        <>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="metricas-desde"
              style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 500 }}
            >
              Desde
            </label>
            <input
              id="metricas-desde"
              type="date"
              aria-label="Fecha desde"
              value={desdeCustom}
              onChange={(e) => {
                setDesdeCustom(e.target.value)
                setErrorFecha(null)
              }}
              style={inputStyle}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="metricas-hasta"
              style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 500 }}
            >
              Hasta
            </label>
            <input
              id="metricas-hasta"
              type="date"
              aria-label="Fecha hasta"
              value={hastaCustom}
              onChange={(e) => {
                setHastaCustom(e.target.value)
                setErrorFecha(null)
              }}
              style={inputStyle}
            />
          </div>
          <button
            type="button"
            onClick={handleAplicarPersonalizado}
            style={buttonPrimaryStyle}
            aria-label="Aplicar filtro de fechas"
          >
            Aplicar
          </button>
        </>
      )}

      {/* Error inline de validación */}
      {errorFecha && (
        <p
          role="alert"
          style={{
            fontSize: '12px',
            color: 'var(--color-status-alert)',
            alignSelf: 'flex-end',
            marginBottom: '10px',
          }}
        >
          {errorFecha}
        </p>
      )}

      {/* Botón Limpiar — visible si hay filtro activo (!esRangoPorDefecto) */}
      {!esRangoPorDefecto && (
        <button
          type="button"
          onClick={onLimpiar}
          style={buttonSecondaryStyle}
          aria-label="Limpiar filtros y volver al período por defecto"
        >
          Limpiar
        </button>
      )}
    </div>
  )
}
