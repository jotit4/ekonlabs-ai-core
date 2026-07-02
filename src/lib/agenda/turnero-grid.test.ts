import { describe, it, expect } from 'vitest'
import type { Appointment } from '@/types/appointments'
import type { AvailabilityShift } from '@/types/availability'
import {
  hhmmToMinutes,
  minutesToHHMM,
  floorToStep,
  hhmmFromDate,
  computeHourRows,
  buildCellMap,
  makeGetCell,
  cellKey,
  type ApptEntry,
  type FreeEntry,
} from './turnero-grid'

describe('turnero-grid helpers', () => {
  describe('conversión de horas', () => {
    it('hhmmToMinutes / minutesToHHMM son inversas', () => {
      expect(hhmmToMinutes('08:30')).toBe(510)
      expect(minutesToHHMM(510)).toBe('08:30')
      expect(minutesToHHMM(0)).toBe('00:00')
      expect(minutesToHHMM(9 * 60)).toBe('09:00')
    })

    it('floorToStep redondea hacia abajo al paso', () => {
      expect(floorToStep('09:45', 60)).toBe('09:00')
      expect(floorToStep('09:00', 60)).toBe('09:00')
      expect(floorToStep('09:45', 30)).toBe('09:30')
      expect(floorToStep('09:15', 30)).toBe('09:00')
    })

    it('hhmmFromDate usa la hora local', () => {
      const d = new Date(2026, 4, 7, 9, 5)
      expect(hhmmFromDate(d)).toBe('09:05')
    })
  })

  describe('computeHourRows', () => {
    it('usa la ventana por defecto 08:00–20:00 (fin exclusivo) sin datos', () => {
      const rows = computeHourRows([])
      expect(rows[0]).toBe('08:00')
      expect(rows[rows.length - 1]).toBe('19:00')
      expect(rows).toHaveLength(12)
    })

    it('expande hacia atrás para incluir un turno temprano', () => {
      const rows = computeHourRows(['07:00'])
      expect(rows[0]).toBe('07:00')
    })

    it('expande hacia adelante para incluir un turno tardío', () => {
      const rows = computeHourRows(['21:30'])
      expect(rows).toContain('20:00')
      expect(rows).toContain('21:00')
      expect(rows).not.toContain('22:00')
    })

    it('respeta un paso de 30 minutos', () => {
      const rows = computeHourRows([], { stepMin: 30, dayStart: '08:00', dayEnd: '09:00' })
      expect(rows).toEqual(['08:00', '08:30'])
    })
  })

  describe('buildCellMap', () => {
    const hourRows = ['08:00', '09:00', '10:00', '11:00']
    const apt = { appointment_id: 'a1', start_at: '2026-05-07T09:00:00' } as unknown as Appointment
    const shift = { slot_start_iso: '2026-05-07T13:00:00Z', professional_id: 'p1', open: '10:00' } as unknown as AvailabilityShift

    const appts: ApptEntry[] = [{ colId: 'p1', hour: '09:00', apt }]
    const frees: FreeEntry[] = [{ colId: 'p1', hour: '10:00', shift }]

    it('ubica turnos y huecos en su celda', () => {
      const map = buildCellMap(hourRows, appts, frees)
      expect(map.get(cellKey('p1', '09:00'))?.appointments).toEqual([apt])
      expect(map.get(cellKey('p1', '10:00'))?.freeShifts).toEqual([shift])
    })

    it('marca outOfHours las celdas fuera de la ventana activa de la columna', () => {
      const map = buildCellMap(hourRows, appts, frees)
      // ventana activa p1 = 09:00..10:00
      expect(map.get(cellKey('p1', '08:00'))?.outOfHours).toBe(true)
      expect(map.get(cellKey('p1', '11:00'))?.outOfHours).toBe(true)
      // dentro de la ventana no es outOfHours
      expect(map.get(cellKey('p1', '09:00'))?.outOfHours).toBe(false)
    })

    it('makeGetCell devuelve una celda vacía para combinaciones sin datos', () => {
      const map = buildCellMap(hourRows, appts, frees)
      const getCell = makeGetCell(map)
      const empty = getCell('p1', '09:00')
      expect(empty.appointments).toEqual([apt])
      const unknown = getCell('p2', '09:00')
      expect(unknown.appointments).toEqual([])
      expect(unknown.freeShifts).toEqual([])
    })
  })
})
