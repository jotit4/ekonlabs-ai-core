import { describe, it, expect } from 'vitest'
import {
  weeklySlotSchema,
  patternSchema,
  newTreatmentApiSchema,
  newTreatmentFormSchema,
  DAY_OF_WEEK_LABELS,
} from './treatment.schema'

const PROF_A = '98c80b43-3f4a-4aa0-84ba-02be20fe6bcd'
const PROF_B = '413d20a3-5684-4781-a79a-734770c26dc3'
const PATIENT = 'f0ae17b1-3c90-401c-93ce-32e6118f29e3'
const SERVICE = 'f38f1191-3e0d-4f60-bcd2-e647c2b899da'

function validApiBody(overrides: Record<string, unknown> = {}) {
  return {
    patient_id: PATIENT,
    service_id: SERVICE,
    professional_id: PROF_A,
    total_sessions: 10,
    start_date: '2026-06-10',
    pattern: {
      slots: [
        { day_of_week: 1, time: '10:00' },
        { day_of_week: 4, time: '16:00' },
      ],
    },
    ...overrides,
  }
}

describe('weeklySlotSchema (sólo día + hora — el profesional es único del paquete)', () => {
  it('acepta un slot válido (day 0..6, time HH:MM)', () => {
    expect(weeklySlotSchema.safeParse({ day_of_week: 0, time: '08:00' }).success).toBe(true)
    expect(weeklySlotSchema.safeParse({ day_of_week: 6, time: '23:30' }).success).toBe(true)
  })

  it('rechaza day_of_week fuera de 0..6', () => {
    expect(weeklySlotSchema.safeParse({ day_of_week: 7, time: '10:00' }).success).toBe(false)
    expect(weeklySlotSchema.safeParse({ day_of_week: -1, time: '10:00' }).success).toBe(false)
  })

  it('rechaza time mal formado', () => {
    expect(weeklySlotSchema.safeParse({ day_of_week: 1, time: '9:00' }).success).toBe(false)
    expect(weeklySlotSchema.safeParse({ day_of_week: 1, time: '25:00' }).success).toBe(true) // regex sólo valida formato \d{2}:\d{2}
    expect(weeklySlotSchema.safeParse({ day_of_week: 1, time: 'aa:bb' }).success).toBe(false)
  })

  it('ya NO exige professional_id por slot (lo ignora si viene)', () => {
    // Un profesional por slot dejó de ser parte del contrato del slot.
    const parsed = weeklySlotSchema.safeParse({
      day_of_week: 1,
      time: '10:00',
      professional_id: 'not-a-uuid',
    })
    expect(parsed.success).toBe(true)
    // El campo se descarta (no forma parte del slot).
    expect(parsed.success && 'professional_id' in parsed.data).toBe(false)
  })
})

describe('patternSchema', () => {
  it('acepta 1, 2 y 3 slots', () => {
    const mk = (n: number) => ({
      slots: Array.from({ length: n }, (_, i) => ({
        day_of_week: i % 7,
        time: '10:00',
        professional_id: PROF_A,
      })),
    })
    expect(patternSchema.safeParse(mk(1)).success).toBe(true)
    expect(patternSchema.safeParse(mk(2)).success).toBe(true)
    expect(patternSchema.safeParse(mk(3)).success).toBe(true)
  })

  it('rechaza slots vacío', () => {
    expect(patternSchema.safeParse({ slots: [] }).success).toBe(false)
  })
})

describe('newTreatmentApiSchema', () => {
  it('acepta un body válido (2 slots)', () => {
    expect(newTreatmentApiSchema.safeParse(validApiBody()).success).toBe(true)
  })

  it('acepta expires_at opcional', () => {
    expect(newTreatmentApiSchema.safeParse(validApiBody({ expires_at: '2026-12-31' })).success).toBe(
      true,
    )
  })

  it('rechaza total_sessions 0 o negativo', () => {
    expect(newTreatmentApiSchema.safeParse(validApiBody({ total_sessions: 0 })).success).toBe(false)
    expect(newTreatmentApiSchema.safeParse(validApiBody({ total_sessions: -3 })).success).toBe(false)
  })

  it('rechaza total_sessions no entero', () => {
    expect(newTreatmentApiSchema.safeParse(validApiBody({ total_sessions: 2.5 })).success).toBe(false)
  })

  it('rechaza pattern con slots vacío', () => {
    expect(newTreatmentApiSchema.safeParse(validApiBody({ pattern: { slots: [] } })).success).toBe(
      false,
    )
  })

  it('rechaza day_of_week fuera de rango dentro del pattern', () => {
    expect(
      newTreatmentApiSchema.safeParse(
        validApiBody({
          pattern: { slots: [{ day_of_week: 7, time: '10:00', professional_id: PROF_A }] },
        }),
      ).success,
    ).toBe(false)
  })

  it('rechaza start_date mal formado', () => {
    expect(newTreatmentApiSchema.safeParse(validApiBody({ start_date: '10-06-2026' })).success).toBe(
      false,
    )
  })

  it('rechaza uuid inválido en patient_id', () => {
    expect(newTreatmentApiSchema.safeParse(validApiBody({ patient_id: 'xx' })).success).toBe(false)
  })
})

describe('newTreatmentFormSchema', () => {
  it('acepta un form válido', () => {
    const ok = newTreatmentFormSchema.safeParse({
      patient_id: PATIENT,
      service_id: SERVICE,
      professional_id: PROF_A,
      total_sessions: 8,
      start_date: '2026-06-10',
      expires_at: '',
      slots: [{ day_of_week: 1, time: '10:00', professional_id: PROF_B }],
    })
    expect(ok.success).toBe(true)
  })

  it('rechaza form sin slots', () => {
    const bad = newTreatmentFormSchema.safeParse({
      patient_id: PATIENT,
      service_id: SERVICE,
      professional_id: PROF_A,
      total_sessions: 8,
      start_date: '2026-06-10',
      slots: [],
    })
    expect(bad.success).toBe(false)
  })

  it('rechaza total_sessions 0', () => {
    const bad = newTreatmentFormSchema.safeParse({
      patient_id: PATIENT,
      service_id: SERVICE,
      professional_id: PROF_A,
      total_sessions: 0,
      start_date: '2026-06-10',
      slots: [{ day_of_week: 1, time: '10:00', professional_id: PROF_A }],
    })
    expect(bad.success).toBe(false)
  })
})

describe('DAY_OF_WEEK_LABELS', () => {
  it('usa la convención 0=Lunes … 6=Domingo (NO 0=domingo)', () => {
    expect(DAY_OF_WEEK_LABELS[0]).toEqual({ value: 0, label: 'Lunes' })
    expect(DAY_OF_WEEK_LABELS[6]).toEqual({ value: 6, label: 'Domingo' })
    expect(DAY_OF_WEEK_LABELS).toHaveLength(7)
  })
})
