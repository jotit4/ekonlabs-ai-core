import { describe, it, expect } from 'vitest'
import { calculateAge, pickTratamientoObjetivo, buildSessionRows } from './ficha-helpers'

describe('calculateAge', () => {
  it('calcula la edad en años a partir de date_of_birth', () => {
    expect(calculateAge('1990-05-15', new Date('2026-07-08'))).toBe(36)
  })

  it('devuelve null si no hay fecha de nacimiento', () => {
    expect(calculateAge(null)).toBeNull()
    expect(calculateAge(undefined)).toBeNull()
  })

  it('devuelve null si la fecha es inválida', () => {
    expect(calculateAge('no-es-una-fecha')).toBeNull()
  })

  it('no cumplió años todavía este año → resta 1', () => {
    // Nace el 25/12 — al 08/07 del mismo año calendario aún no cumplió.
    expect(calculateAge('2000-12-25', new Date('2026-07-08'))).toBe(25)
  })
})

describe('pickTratamientoObjetivo', () => {
  it('devuelve null si no hay tratamientos', () => {
    expect(pickTratamientoObjetivo([])).toBeNull()
  })

  it('devuelve null si ningún tratamiento tiene objetivo cargado', () => {
    const treatments = [
      { status: 'active', created_at: '2026-01-01', treatment_plans: null },
      { status: 'completed', created_at: '2026-02-01', treatment_plans: { objetivo: null } },
    ]
    expect(pickTratamientoObjetivo(treatments)).toBeNull()
  })

  it('prioriza el tratamiento ACTIVO más reciente con objetivo', () => {
    const treatments = [
      { status: 'completed', created_at: '2026-03-01', treatment_plans: { objetivo: 'Rehab rodilla' } },
      { status: 'active', created_at: '2026-01-01', treatment_plans: { objetivo: 'Rehab hombro (viejo)' } },
      { status: 'active', created_at: '2026-05-01', treatment_plans: { objetivo: 'Rehab hombro (nuevo)' } },
    ]
    expect(pickTratamientoObjetivo(treatments)).toBe('Rehab hombro (nuevo)')
  })

  it('si ningún activo tiene objetivo, cae al más reciente de cualquier status', () => {
    const treatments = [
      { status: 'active', created_at: '2026-01-01', treatment_plans: null },
      { status: 'completed', created_at: '2026-04-01', treatment_plans: { objetivo: 'Rehab columna' } },
      { status: 'cancelled', created_at: '2026-02-01', treatment_plans: { objetivo: 'Rehab tobillo' } },
    ]
    expect(pickTratamientoObjetivo(treatments)).toBe('Rehab columna')
  })

  it('soporta treatment_plans como array (embed reverso de PostgREST)', () => {
    const treatments = [
      { status: 'active', created_at: '2026-01-01', treatment_plans: [{ objetivo: 'Rehab cadera' }] },
    ]
    expect(pickTratamientoObjetivo(treatments)).toBe('Rehab cadera')
  })
})

describe('buildSessionRows', () => {
  it('genera filas 1..total_sessions vacías si no hay turnos', () => {
    const rows = buildSessionRows(3, [])
    expect(rows).toEqual([
      { session_index: 1, start_at: null, status: null },
      { session_index: 2, start_at: null, status: null },
      { session_index: 3, start_at: null, status: null },
    ])
  })

  it('ubica cada turno real en su session_index', () => {
    const rows = buildSessionRows(3, [
      { session_index: 2, start_at: '2026-06-01T10:00:00Z', status: 'completed' },
      { session_index: 1, start_at: '2026-05-25T10:00:00Z', status: 'confirmed' },
    ])
    expect(rows).toEqual([
      { session_index: 1, start_at: '2026-05-25T10:00:00Z', status: 'confirmed' },
      { session_index: 2, start_at: '2026-06-01T10:00:00Z', status: 'completed' },
      { session_index: 3, start_at: null, status: null },
    ])
  })

  it('ignora turnos sin session_index', () => {
    const rows = buildSessionRows(1, [
      { session_index: null, start_at: '2026-06-01T10:00:00Z', status: 'confirmed' },
    ])
    expect(rows).toEqual([{ session_index: 1, start_at: null, status: null }])
  })

  it('total_sessions negativo o cero no genera filas', () => {
    expect(buildSessionRows(0, [])).toEqual([])
    expect(buildSessionRows(-2, [])).toEqual([])
  })
})
