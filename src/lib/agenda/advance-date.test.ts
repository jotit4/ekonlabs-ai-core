import { describe, it, expect } from 'vitest'
import { advanceDate } from './advance-date'

describe('advanceDate', () => {
  it('avanza N días calendario', () => {
    // 2026-07-06 es lunes.
    expect(advanceDate('2026-07-06', 1)).toBe('2026-07-07')
    expect(advanceDate('2026-07-06', 3)).toBe('2026-07-09')
  })

  it('salta el sábado al lunes siguiente', () => {
    // 2026-07-10 es viernes; +1 día cae sábado (2026-07-11) → salta a lunes 2026-07-13.
    expect(advanceDate('2026-07-10', 1)).toBe('2026-07-13')
  })

  it('salta el domingo al lunes', () => {
    // 2026-07-10 es viernes; +2 días cae domingo (2026-07-12) → salta a lunes 2026-07-13.
    expect(advanceDate('2026-07-10', 2)).toBe('2026-07-13')
  })

  it('cadencia "todos los días" (skip=1) encadena de lunes a viernes sin pisar el finde', () => {
    let d = '2026-07-06' // lunes
    const dias: string[] = []
    for (let i = 0; i < 5; i++) {
      d = advanceDate(d, 1)
      dias.push(d)
    }
    expect(dias).toEqual(['2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10', '2026-07-13'])
  })

  it('devuelve la fecha original si el ISO es inválido', () => {
    expect(advanceDate('no-es-fecha', 1)).toBe('no-es-fecha')
  })
})
