// Helpers puros para la grilla de turnos (TurneroGrid).
//
// Toda la aritmética de horas vive acá (sin dependencias de React ni date-fns)
// para poder testearla de forma aislada y compartirla entre la vista Día
// (columnas = profesionales) y la vista Semana (columnas = días).

import type { Appointment } from '@/types/appointments'
import type { AvailabilityShift } from '@/types/availability'

/** 'HH:MM' → minutos desde medianoche. Tolera 'H:MM'. */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':')
  return Number(h) * 60 + Number(m ?? 0)
}

/** minutos desde medianoche → 'HH:MM' (siempre 2 dígitos). */
export function minutesToHHMM(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Redondea una hora 'HH:MM' hacia abajo al múltiplo de `stepMin` (fila de la grilla). */
export function floorToStep(hhmm: string, stepMin: number): string {
  const total = hhmmToMinutes(hhmm)
  return minutesToHHMM(Math.floor(total / stepMin) * stepMin)
}

/** Hora local 'HH:MM' de un Date (usa la zona horaria del navegador). */
export function hhmmFromDate(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export interface ComputeHourRowsOptions {
  /** Paso entre filas en minutos (default 60). */
  stepMin?: number
  /** Inicio de la ventana por defecto (default '08:00'). */
  dayStart?: string
  /** Fin de la ventana por defecto (default '20:00'). */
  dayEnd?: string
}

/**
 * Calcula las filas de hora de la grilla.
 *
 * Parte de la ventana por defecto (08:00–20:00) y la EXPANDE para incluir
 * cualquier hora presente en `times` (turnos + huecos) que caiga fuera. Así la
 * mañana completa siempre entra sin scroll, pero un turno a las 07:00 o 21:00
 * nunca queda oculto.
 */
export function computeHourRows(
  times: string[],
  opts: ComputeHourRowsOptions = {},
): string[] {
  const stepMin = opts.stepMin ?? 60
  const dayStart = opts.dayStart ?? '08:00'
  const dayEnd = opts.dayEnd ?? '20:00'

  let startMin = hhmmToMinutes(dayStart)
  let endMin = hhmmToMinutes(dayEnd)

  for (const t of times) {
    if (!t) continue
    const floored = Math.floor(hhmmToMinutes(t) / stepMin) * stepMin
    if (floored < startMin) startMin = floored
    if (floored + stepMin > endMin) endMin = floored + stepMin
  }

  const rows: string[] = []
  for (let x = startMin; x < endMin; x += stepMin) rows.push(minutesToHHMM(x))
  return rows
}

// ─── Tipos y armado de celdas de la grilla ────────────────────────────────────

export interface TurneroColumn {
  /** Identificador estable (professional_id o fecha ISO). */
  id: string
  /** Etiqueta principal del encabezado (nombre de profesional o día). */
  label: string
  /** Etiqueta secundaria (nº de turnos, fecha corta…). */
  sublabel?: string
  /** Resalta la columna (ej. el día de hoy en la vista Semana). */
  isHighlighted?: boolean
}

export interface TurneroCell {
  /** Turnos ocupados que caen en esta franja. */
  appointments: Appointment[]
  /** Huecos libres disponibles en esta franja. */
  freeShifts: AvailabilityShift[]
  /** Fuera del horario de atención de la columna → celda apagada, no clickeable. */
  outOfHours: boolean
}

export interface ApptEntry {
  colId: string
  hour: string
  apt: Appointment
}

export interface FreeEntry {
  colId: string
  hour: string
  shift: AvailabilityShift
}

const EMPTY_IN_RANGE: TurneroCell = { appointments: [], freeShifts: [], outOfHours: false }

/** Clave del mapa de celdas. */
export function cellKey(colId: string, hour: string): string {
  return `${colId}|${hour}`
}

/**
 * Construye el mapa de celdas (colId|hour → TurneroCell) a partir de los turnos
 * y huecos ya bucketizados por (columna, hora).
 *
 * Para cada columna calcula su ventana activa (primera y última fila con datos):
 * las filas fuera de esa ventana quedan marcadas `outOfHours` (gris apagado);
 * las filas dentro de la ventana sin datos son huecos vacíos discretos.
 */
export function buildCellMap(
  hourRows: string[],
  appts: ApptEntry[],
  frees: FreeEntry[],
): Map<string, TurneroCell> {
  const rowIndex = new Map(hourRows.map((h, i) => [h, i]))
  const map = new Map<string, TurneroCell>()

  const ensure = (colId: string, hour: string): TurneroCell => {
    const key = cellKey(colId, hour)
    let cell = map.get(key)
    if (!cell) {
      cell = { appointments: [], freeShifts: [], outOfHours: false }
      map.set(key, cell)
    }
    return cell
  }

  // Rango activo por columna (min/max índice de fila con datos).
  const activeRange = new Map<string, { min: number; max: number }>()
  const track = (colId: string, hour: string) => {
    const idx = rowIndex.get(hour)
    if (idx === undefined) return
    const r = activeRange.get(colId)
    if (!r) activeRange.set(colId, { min: idx, max: idx })
    else {
      if (idx < r.min) r.min = idx
      if (idx > r.max) r.max = idx
    }
  }

  for (const { colId, hour, apt } of appts) {
    ensure(colId, hour).appointments.push(apt)
    track(colId, hour)
  }
  for (const { colId, hour, shift } of frees) {
    ensure(colId, hour).freeShifts.push(shift)
    track(colId, hour)
  }

  // Marcar outOfHours en las celdas vacías fuera de la ventana activa.
  for (const [colId, range] of activeRange) {
    hourRows.forEach((hour, idx) => {
      if (idx < range.min || idx > range.max) {
        ensure(colId, hour).outOfHours = true
      }
    })
  }

  return map
}

/** Accessor listo para `TurneroGrid.getCell` a partir del mapa. */
export function makeGetCell(
  map: Map<string, TurneroCell>,
  activeColumns?: Set<string>,
): (colId: string, hour: string) => TurneroCell {
  return (colId, hour) => {
    const cell = map.get(cellKey(colId, hour))
    if (cell) return cell
    // Columna sin datos en absoluto → todo fuera de horario.
    if (activeColumns && !activeColumns.has(colId)) {
      return { appointments: [], freeShifts: [], outOfHours: true }
    }
    return EMPTY_IN_RANGE
  }
}
