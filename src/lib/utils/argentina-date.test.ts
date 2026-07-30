import { describe, expect, it } from 'vitest'
import { getArgentinaToday } from './argentina-date'

describe('getArgentinaToday', () => {
  it('mantiene el día argentino antes de la medianoche local aunque UTC ya cambió', () => {
    expect(getArgentinaToday(new Date('2026-07-31T01:30:00.000Z'))).toBe('2026-07-30')
  })

  it('cambia de día a la medianoche de Buenos Aires', () => {
    expect(getArgentinaToday(new Date('2026-07-31T03:00:00.000Z'))).toBe('2026-07-31')
  })
})
