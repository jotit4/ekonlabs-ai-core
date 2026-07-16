import { describe, it, expect } from 'vitest'
import { listAlternateProfessionalShifts } from './reception-retry'
import type { AvailabilityShift } from '@/types/availability'

function makeShift(overrides: Partial<AvailabilityShift> = {}): AvailabilityShift {
  return {
    open: '10:00',
    close: '11:00',
    slot_start_iso: '2026-07-16T13:00:00.000Z',
    slot_end_iso: '2026-07-16T14:00:00.000Z',
    service_id: 'svc-1',
    service_name: 'Kinesiología',
    require_referral: false,
    professional_id: 'prof-1',
    professional_name: 'Patricia Pérez',
    ...overrides,
  }
}

describe('listAlternateProfessionalShifts (Ítem B5 — reintento tras 409 del hueco colapsado)', () => {
  it('devuelve el otro profesional libre a la MISMA hora, excluyendo el que ya se intentó', () => {
    const shifts = [
      makeShift({ professional_id: 'prof-1', professional_name: 'Patricia Pérez' }),
      makeShift({ professional_id: 'prof-2', professional_name: 'Aldo Luque', service_id: 'svc-2' }),
    ]

    const alternates = listAlternateProfessionalShifts(shifts, '10:00', 'prof-1')

    expect(alternates).toHaveLength(1)
    expect(alternates[0].professional_id).toBe('prof-2')
    expect(alternates[0].service_id).toBe('svc-2')
  })

  it('devuelve [] cuando no queda ningún otro profesional a esa hora (solo estaba el ya intentado)', () => {
    const shifts = [makeShift({ professional_id: 'prof-1' })]

    expect(listAlternateProfessionalShifts(shifts, '10:00', 'prof-1')).toEqual([])
  })

  it('ignora huecos de OTRA hora, aunque sean de otro profesional', () => {
    const shifts = [
      makeShift({ professional_id: 'prof-1', open: '10:00' }),
      makeShift({ professional_id: 'prof-2', open: '11:00' }),
    ]

    expect(listAlternateProfessionalShifts(shifts, '10:00', 'prof-1')).toEqual([])
  })

  it('de-duplica: un profesional con más de un hueco a la misma hora aparece una sola vez', () => {
    const shifts = [
      makeShift({ professional_id: 'prof-2', service_id: 'svc-1' }),
      makeShift({ professional_id: 'prof-2', service_id: 'svc-2' }),
    ]

    const alternates = listAlternateProfessionalShifts(shifts, '10:00', 'prof-1')

    expect(alternates).toHaveLength(1)
  })

  it('preserva el orden de aparición (primer profesional libre encontrado, primero en probarse)', () => {
    const shifts = [
      makeShift({ professional_id: 'prof-3' }),
      makeShift({ professional_id: 'prof-2' }),
    ]

    const alternates = listAlternateProfessionalShifts(shifts, '10:00', 'prof-1')

    expect(alternates.map((s) => s.professional_id)).toEqual(['prof-3', 'prof-2'])
  })
})
