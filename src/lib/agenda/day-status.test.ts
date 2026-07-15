import { describe, it, expect } from 'vitest'
import { computeEffectiveOpen, dayStatusBadge } from './day-status'
import type { DayStatusEntry } from '@/types/holidays'

// ─── computeEffectiveOpen — espejo JS de la RPC (migración 052) ────────────────
// Tabla de verdad completa: es la regla de negocio más sensible del feature
// (un resultado mal calculado = turnos ofrecidos en un día cerrado, o un
// feriado bloqueado sin necesidad).
describe('computeEffectiveOpen', () => {
  it('feriado sin decisión → CERRADO por defecto (lado seguro)', () => {
    expect(computeEffectiveOpen({ isHoliday: true, decisionIsOpen: null })).toBe(false)
  })

  it('feriado sin decisión (undefined) → CERRADO por defecto', () => {
    expect(computeEffectiveOpen({ isHoliday: true, decisionIsOpen: undefined })).toBe(false)
  })

  it('feriado CON decisión "abre" → ABIERTO (la clínica lo overridea)', () => {
    expect(computeEffectiveOpen({ isHoliday: true, decisionIsOpen: true })).toBe(true)
  })

  it('feriado CON decisión "cierra" → CERRADO (redundante pero consistente)', () => {
    expect(computeEffectiveOpen({ isHoliday: true, decisionIsOpen: false })).toBe(false)
  })

  it('día normal sin decisión → ABIERTO (comportamiento actual, sin cambios)', () => {
    expect(computeEffectiveOpen({ isHoliday: false, decisionIsOpen: null })).toBe(true)
  })

  it('día normal CON decisión "cierra" → CERRADO (ej. corte de agua)', () => {
    expect(computeEffectiveOpen({ isHoliday: false, decisionIsOpen: false })).toBe(false)
  })

  it('día normal CON decisión "abre" → ABIERTO (redundante pero consistente)', () => {
    expect(computeEffectiveOpen({ isHoliday: false, decisionIsOpen: true })).toBe(true)
  })
})

// ─── dayStatusBadge — qué se le muestra a la recepcionista ────────────────────
function makeEntry(overrides: Partial<DayStatusEntry> = {}): DayStatusEntry {
  return {
    date: '2026-12-08',
    isHoliday: false,
    holidayName: null,
    decisionIsOpen: null,
    decidedByName: null,
    decidedAt: null,
    reason: null,
    effectiveOpen: true,
    ...overrides,
  }
}

describe('dayStatusBadge', () => {
  it('entry null/undefined → sin badge (día normal, nada que mostrar)', () => {
    expect(dayStatusBadge(null)).toBeNull()
    expect(dayStatusBadge(undefined)).toBeNull()
  })

  it('día normal sin decisión (no debería llegar como entry, pero por las dudas) → sin badge', () => {
    expect(dayStatusBadge(makeEntry({ isHoliday: false, decisionIsOpen: null, effectiveOpen: true }))).toBeNull()
  })

  it('feriado sin decisión → badge "Cerrado" con nombre del feriado, tono closed', () => {
    const badge = dayStatusBadge(
      makeEntry({
        isHoliday: true,
        holidayName: 'Día de la Inmaculada Concepción de María',
        decisionIsOpen: null,
        effectiveOpen: false,
      }),
    )
    expect(badge).not.toBeNull()
    expect(badge?.tone).toBe('closed')
    expect(badge?.text).toContain('Día de la Inmaculada Concepción de María')
    expect(badge?.ariaLabel).toMatch(/feriado nacional/i)
    expect(badge?.ariaLabel).toMatch(/cerrado/i)
  })

  it('feriado con decisión "abre" → badge tono holiday-open, menciona el feriado', () => {
    const badge = dayStatusBadge(
      makeEntry({
        isHoliday: true,
        holidayName: 'Día del Trabajador',
        decisionIsOpen: true,
        effectiveOpen: true,
      }),
    )
    expect(badge?.tone).toBe('holiday-open')
    expect(badge?.text).toContain('Día del Trabajador')
    expect(badge?.text).toMatch(/abre/i)
  })

  it('día normal cerrado a mano (no feriado) → badge "Cerrado" SIN nombre de feriado', () => {
    const badge = dayStatusBadge(
      makeEntry({ isHoliday: false, holidayName: null, decisionIsOpen: false, effectiveOpen: false }),
    )
    expect(badge?.tone).toBe('closed')
    expect(badge?.text).toBe('Cerrado')
    expect(badge?.text).not.toMatch(/feriado/i)
  })

  it('día normal reabierto a mano → badge tono open-override', () => {
    const badge = dayStatusBadge(
      makeEntry({ isHoliday: false, holidayName: null, decisionIsOpen: true, effectiveOpen: true }),
    )
    expect(badge?.tone).toBe('open-override')
    expect(badge?.text).toMatch(/abre/i)
  })
})
