import { describe, it, expect } from 'vitest'
import { sessionSlotSchema, createSessionsApiSchema, MAX_SESSIONS_PER_REQUEST } from './treatment-session.schema'

const PROF = '98c80b43-3f4a-4aa0-84ba-02be20fe6bcd'

describe('sessionSlotSchema', () => {
  it('acepta un slot sin professional_id (paquete con profesional fijo)', () => {
    const parsed = sessionSlotSchema.safeParse({
      start_at: '2026-06-10T13:00:00.000Z',
      end_at: '2026-06-10T14:00:00.000Z',
    })
    expect(parsed.success).toBe(true)
  })

  it('acepta un slot CON professional_id (Pedido A #2/#3 — paquete sin profesional fijo)', () => {
    const parsed = sessionSlotSchema.safeParse({
      start_at: '2026-06-10T13:00:00.000Z',
      end_at: '2026-06-10T14:00:00.000Z',
      professional_id: PROF,
    })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.professional_id).toBe(PROF)
  })

  it('rechaza professional_id que no sea uuid', () => {
    const parsed = sessionSlotSchema.safeParse({
      start_at: '2026-06-10T13:00:00.000Z',
      end_at: '2026-06-10T14:00:00.000Z',
      professional_id: 'not-a-uuid',
    })
    expect(parsed.success).toBe(false)
  })

  it('rechaza start_at / end_at vacíos', () => {
    expect(sessionSlotSchema.safeParse({ start_at: '', end_at: 'x' }).success).toBe(false)
    expect(sessionSlotSchema.safeParse({ start_at: 'x', end_at: '' }).success).toBe(false)
  })
})

describe('createSessionsApiSchema', () => {
  it('acepta una lista de slots mixta (con y sin professional_id)', () => {
    const parsed = createSessionsApiSchema.safeParse({
      slots: [
        { start_at: '2026-06-10T13:00:00.000Z', end_at: '2026-06-10T14:00:00.000Z' },
        { start_at: '2026-06-11T13:00:00.000Z', end_at: '2026-06-11T14:00:00.000Z', professional_id: PROF },
      ],
    })
    expect(parsed.success).toBe(true)
  })

  it('rechaza lista vacía', () => {
    expect(createSessionsApiSchema.safeParse({ slots: [] }).success).toBe(false)
  })

  it('rechaza más de MAX_SESSIONS_PER_REQUEST slots', () => {
    const slots = Array.from({ length: MAX_SESSIONS_PER_REQUEST + 1 }, (_, i) => ({
      start_at: `2026-06-${10 + i}T13:00:00.000Z`,
      end_at: `2026-06-${10 + i}T14:00:00.000Z`,
    }))
    expect(createSessionsApiSchema.safeParse({ slots }).success).toBe(false)
  })

  describe('color (Pedido 6 ISADI 2026-07-14/16 — color único para toda la tanda)', () => {
    const slots = [{ start_at: '2026-06-10T13:00:00.000Z', end_at: '2026-06-10T14:00:00.000Z' }]

    it('acepta sin color (comportamiento actual, sin cambios)', () => {
      const parsed = createSessionsApiSchema.safeParse({ slots })
      expect(parsed.success).toBe(true)
      expect(parsed.success && parsed.data.color).toBeUndefined()
    })

    it('acepta un color hex válido (#RRGGBB) a nivel request', () => {
      const parsed = createSessionsApiSchema.safeParse({ slots, color: '#00FFFF' })
      expect(parsed.success).toBe(true)
      expect(parsed.success && parsed.data.color).toBe('#00FFFF')
    })

    it('rechaza un color con formato inválido', () => {
      expect(createSessionsApiSchema.safeParse({ slots, color: 'cyan' }).success).toBe(false)
      expect(createSessionsApiSchema.safeParse({ slots, color: '#FFF' }).success).toBe(false)
      expect(createSessionsApiSchema.safeParse({ slots, color: '00FFFF' }).success).toBe(false)
    })
  })
})
