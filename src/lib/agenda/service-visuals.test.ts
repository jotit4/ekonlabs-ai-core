import { describe, it, expect } from 'vitest'
import { isRehabService, getServiceColor } from './service-visuals'

describe('isRehabService (heurística por nombre, PROVISIONAL)', () => {
  it('matchea los servicios de rehabilitación de ISADI', () => {
    expect(isRehabService('Fisioterapia')).toBe(true)
    expect(isRehabService('Kinesiología')).toBe(true)
    expect(isRehabService('Rehabilitación física')).toBe(true)
    expect(isRehabService('Rehabilitación traumatológica')).toBe(true)
  })

  it('matchea variantes razonables (case-insensitive, acentos, "terapia física")', () => {
    expect(isRehabService('FISIO')).toBe(true)
    expect(isRehabService('kinesio')).toBe(true)
    expect(isRehabService('Terapia fisica')).toBe(true)
    expect(isRehabService('Terapia física')).toBe(true)
  })

  it('NO matchea servicios fuera del área (médicos/pileta)', () => {
    expect(isRehabService('Pediatría')).toBe(false)
    expect(isRehabService('Consulta médica')).toBe(false)
    expect(isRehabService('Natación terapéutica')).toBe(false)
    expect(isRehabService('Pileta')).toBe(false)
  })

  it('tolera null/undefined/vacío → false', () => {
    expect(isRehabService(null)).toBe(false)
    expect(isRehabService(undefined)).toBe(false)
    expect(isRehabService('')).toBe(false)
  })
})

describe('getServiceColor (estable y determinístico)', () => {
  it('devuelve siempre el mismo color para el mismo service_id', () => {
    const a = getServiceColor('svc-123')
    const b = getServiceColor('svc-123')
    expect(a).toBe(b)
  })

  it('devuelve un color hex de la paleta', () => {
    expect(getServiceColor('svc-1')).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('servicios distintos tienden a colores distintos (no colapsa todo a uno)', () => {
    const colors = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => getServiceColor(`svc-${id}`)),
    )
    expect(colors.size).toBeGreaterThan(1)
  })

  it('devuelve un fallback estable cuando no hay service_id', () => {
    expect(getServiceColor(null)).toMatch(/^#[0-9a-f]{6}$/i)
    expect(getServiceColor(null)).toBe(getServiceColor(undefined))
  })
})
