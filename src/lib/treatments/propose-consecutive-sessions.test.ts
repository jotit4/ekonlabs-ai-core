import { describe, it, expect } from 'vitest'
import { proposeConsecutiveSessions } from './propose-consecutive-sessions'
import type { AvailabilityShift } from '@/types/availability'

function shift(date: string, hhmm: string, prof = 'prof-1', profName = 'Patricia Pérez'): AvailabilityShift {
  const hour = hhmm.slice(0, 2)
  return {
    open: hhmm,
    close: hhmm,
    slot_start_iso: `${date}T${hour}:00:00.000Z`,
    slot_end_iso: `${date}T${hour}:59:00.000Z`,
    service_id: 'svc-1',
    service_name: 'Kinesiología',
    require_referral: false,
    professional_id: prof,
    professional_name: profName,
  }
}

describe('proposeConsecutiveSessions', () => {
  it('propone N-1 fechas consecutivas (skip=1) con hueco a la misma hora — profesional concreto', () => {
    const shiftsByDate: Record<string, AvailabilityShift[]> = {
      '2026-07-07': [shift('2026-07-07', '10:00')],
      '2026-07-08': [shift('2026-07-08', '10:00')],
      '2026-07-09': [shift('2026-07-09', '10:00')],
      '2026-07-10': [shift('2026-07-10', '10:00')],
    }
    const result = proposeConsecutiveSessions({
      anchorDate: '2026-07-06', // lunes
      anchorLabel: '10:00',
      professionalId: 'prof-1',
      remaining: 4,
      skipDays: 1,
      shiftsByDate,
    })

    expect(result).toHaveLength(4)
    expect(result.map((r) => r.date)).toEqual(['2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10'])
    expect(result.every((r) => r.slot !== null)).toBe(true)
    expect(result[0].index).toBe(2)
    expect(result[3].index).toBe(5)
    expect(result[0].slot?.professional_id).toBe('prof-1')
  })

  it('salta el fin de semana (viernes ancla → próxima consecutiva es lunes)', () => {
    const shiftsByDate: Record<string, AvailabilityShift[]> = {
      '2026-07-13': [shift('2026-07-13', '10:00')], // lunes siguiente
    }
    const result = proposeConsecutiveSessions({
      anchorDate: '2026-07-10', // viernes
      anchorLabel: '10:00',
      professionalId: 'prof-1',
      remaining: 1,
      skipDays: 1,
      shiftsByDate,
    })
    expect(result[0].date).toBe('2026-07-13')
    expect(result[0].slot).not.toBeNull()
  })

  it('marca PENDIENTE (slot null) el día sin hueco a esa hora — nunca inventa un horario', () => {
    const shiftsByDate: Record<string, AvailabilityShift[]> = {
      '2026-07-07': [shift('2026-07-07', '11:00')], // otra hora, no calza
    }
    const result = proposeConsecutiveSessions({
      anchorDate: '2026-07-06',
      anchorLabel: '10:00',
      professionalId: 'prof-1',
      remaining: 1,
      skipDays: 1,
      shiftsByDate,
    })
    expect(result[0].slot).toBeNull()
  })

  it('modo "cualquier profesional": prioriza el profesional del ancla si sigue libre', () => {
    const shiftsByDate: Record<string, AvailabilityShift[]> = {
      '2026-07-07': [shift('2026-07-07', '10:00', 'prof-2', 'Aldo Luque'), shift('2026-07-07', '10:00', 'prof-1')],
    }
    const result = proposeConsecutiveSessions({
      anchorDate: '2026-07-06',
      anchorLabel: '10:00',
      anchorProfessionalId: 'prof-1',
      professionalId: null,
      remaining: 1,
      skipDays: 1,
      shiftsByDate,
    })
    expect(result[0].slot?.professional_id).toBe('prof-1')
  })

  it('modo "cualquier profesional": si el del ancla no está libre, acepta cualquier otro con esa hora', () => {
    const shiftsByDate: Record<string, AvailabilityShift[]> = {
      '2026-07-07': [shift('2026-07-07', '10:00', 'prof-2', 'Aldo Luque')],
    }
    const result = proposeConsecutiveSessions({
      anchorDate: '2026-07-06',
      anchorLabel: '10:00',
      anchorProfessionalId: 'prof-1',
      professionalId: null,
      remaining: 1,
      skipDays: 1,
      shiftsByDate,
    })
    expect(result[0].slot?.professional_id).toBe('prof-2')
  })

  it('respeta la cadencia elegida (skip=2, ej. "3 veces por semana")', () => {
    const shiftsByDate: Record<string, AvailabilityShift[]> = {
      '2026-07-08': [shift('2026-07-08', '10:00')],
    }
    const result = proposeConsecutiveSessions({
      anchorDate: '2026-07-06',
      anchorLabel: '10:00',
      professionalId: 'prof-1',
      remaining: 1,
      skipDays: 2,
      shiftsByDate,
    })
    expect(result[0].date).toBe('2026-07-08')
  })

  it('remaining=0 devuelve lista vacía', () => {
    const result = proposeConsecutiveSessions({
      anchorDate: '2026-07-06',
      anchorLabel: '10:00',
      professionalId: 'prof-1',
      remaining: 0,
      skipDays: 1,
      shiftsByDate: {},
    })
    expect(result).toEqual([])
  })
})
