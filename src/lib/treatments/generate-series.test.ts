import { describe, it, expect, vi } from 'vitest'
import { parseISO } from 'date-fns'
import { generateSeries, MAX_WEEKS } from './generate-series'
import type { SlotAvailability } from './generate-series'
import type { WeeklySlot } from '@/lib/schemas/treatment.schema'

const PROF = '11111111-1111-1111-1111-111111111111'

// Helper: isSlotAvailable que SIEMPRE devuelve un hueco derivado de la fecha/slot.
function alwaysAvailable(date: string, slot: WeeklySlot): SlotAvailability {
  // start_at sintético: la fecha + la hora del slot en "UTC" (suficiente para los asserts).
  return {
    start_at: `${date}T${slot.time}:00Z`,
    end_at: `${date}T${slot.time}:00Z`,
  }
}

// day_of_week 0=lunes..6=domingo → JS getDay() esperado.
// lunes(0)→1, martes(1)→2, ... domingo(6)→0.
function expectedJsDay(patternDow: number): number {
  return (patternDow + 1) % 7
}

describe('generateSeries (helper puro)', () => {
  it('patrón de 2 slots, 10 sesiones, todas disponibles → 10 colocadas en orden cronológico', () => {
    // start_date 2026-06-08 es LUNES. slots: martes(1) 10:00 y viernes(4) 16:00.
    const slots: WeeklySlot[] = [
      { day_of_week: 1, time: '10:00', professional_id: PROF }, // martes
      { day_of_week: 4, time: '16:00', professional_id: PROF }, // viernes
    ]
    const res = generateSeries({
      slots,
      start_date: '2026-06-08',
      total_sessions: 10,
      isSlotAvailable: alwaysAvailable,
    })

    expect(res.placements).toHaveLength(10)
    expect(res.salteados).toBe(0)
    expect(res.no_colocados).toBe(0)

    // session_index 1..10 secuencial
    expect(res.placements.map((p) => p.session_index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

    // Orden cronológico estricto por start_at (fecha + hora)
    const dates = res.placements.map((p) => p.date)
    const sorted = [...dates].sort()
    expect(dates).toEqual(sorted)

    // El primer turno cae martes (la primera ocurrencia >= lunes 2026-06-08 del day_of_week=1)
    expect(res.placements[0].date).toBe('2026-06-09') // martes
    expect(res.placements[1].date).toBe('2026-06-12') // viernes
    // semana 2: martes/viernes +7
    expect(res.placements[2].date).toBe('2026-06-16')
    expect(res.placements[3].date).toBe('2026-06-19')
  })

  it('skip de conflicto: una ocurrencia null → se saltea y NO se pierde la sesión', () => {
    const slots: WeeklySlot[] = [
      { day_of_week: 1, time: '10:00', professional_id: PROF },
      { day_of_week: 4, time: '16:00', professional_id: PROF },
    ]
    // El martes de la PRIMERA semana (2026-06-09) está en conflicto.
    const isSlotAvailable = vi.fn((date: string, slot: WeeklySlot) => {
      if (date === '2026-06-09') return null
      return alwaysAvailable(date, slot)
    })

    const res = generateSeries({
      slots,
      start_date: '2026-06-08',
      total_sessions: 10,
      isSlotAvailable,
    })

    // No se pierde ninguna: igual coloca 10
    expect(res.placements).toHaveLength(10)
    expect(res.no_colocados).toBe(0)
    expect(res.salteados).toBeGreaterThanOrEqual(1)
    // session_index sigue siendo 1..10 sin huecos
    expect(res.placements.map((p) => p.session_index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    // El martes saltado NO aparece como placement
    expect(res.placements.find((p) => p.date === '2026-06-09')).toBeUndefined()
  })

  it('corte por N: 3 slots/semana, total_sessions=2 → solo 2 colocadas (no coloca el 3er slot)', () => {
    const slots: WeeklySlot[] = [
      { day_of_week: 0, time: '09:00', professional_id: PROF }, // lunes
      { day_of_week: 2, time: '10:00', professional_id: PROF }, // miércoles
      { day_of_week: 4, time: '11:00', professional_id: PROF }, // viernes
    ]
    const res = generateSeries({
      slots,
      start_date: '2026-06-08', // lunes
      total_sessions: 2,
      isSlotAvailable: alwaysAvailable,
    })

    expect(res.placements).toHaveLength(2)
    expect(res.no_colocados).toBe(0)
    // El 3er slot (viernes) de la semana 1 NO se colocó
    expect(res.placements.map((p) => p.slot.day_of_week)).toEqual([0, 2])
  })

  it('corte por expires_at: no llega a colocar las N → no_colocados = N − creados', () => {
    const slots: WeeklySlot[] = [
      { day_of_week: 1, time: '10:00', professional_id: PROF }, // martes
    ]
    // start lunes 2026-06-08; martes ocurrencias: 06-09, 06-16, 06-23, ...
    // expires_at 2026-06-16 → solo 06-09 y 06-16 entran (2 colocadas).
    const res = generateSeries({
      slots,
      start_date: '2026-06-08',
      total_sessions: 10,
      expires_at: '2026-06-16',
      isSlotAvailable: alwaysAvailable,
    })

    expect(res.placements).toHaveLength(2)
    expect(res.no_colocados).toBe(8)
    // No intentó nada después de expires_at
    expect(res.placements.every((p) => p.date <= '2026-06-16')).toBe(true)
  })

  it('guard MAX_WEEKS: isSlotAvailable siempre null y sin expires_at → corta sin loop infinito', () => {
    const slots: WeeklySlot[] = [
      { day_of_week: 1, time: '10:00', professional_id: PROF },
    ]
    const isSlotAvailable = vi.fn(() => null)

    const res = generateSeries({
      slots,
      start_date: '2026-06-08',
      total_sessions: 5,
      maxWeeks: 10, // límite chico para el test
      isSlotAvailable,
    })

    expect(res.placements).toHaveLength(0)
    expect(res.no_colocados).toBe(5)
    expect(res.salteados).toBe(10) // 1 slot * 10 semanas
    // No iteró más allá de maxWeeks (1 slot/semana)
    expect(isSlotAvailable).toHaveBeenCalledTimes(10)
  })

  it('MAX_WEEKS por defecto es ~104 (≈2 años)', () => {
    expect(MAX_WEEKS).toBe(104)
  })

  it('convención day_of_week 0=lunes..6=domingo: la fecha calculada cae en el día correcto', () => {
    // start_date 2026-06-08 = lunes. Probamos cada day_of_week 0..6.
    for (let dow = 0; dow <= 6; dow++) {
      const res = generateSeries({
        slots: [{ day_of_week: dow, time: '10:00', professional_id: PROF }],
        start_date: '2026-06-08',
        total_sessions: 1,
        isSlotAvailable: alwaysAvailable,
      })
      expect(res.placements).toHaveLength(1)
      const placedDate = parseISO(res.placements[0].date)
      // getDay() del Date debe coincidir con la conversión esperada
      expect(placedDate.getDay()).toBe(expectedJsDay(dow))
    }
  })

  it('day_of_week=1 produce un MARTES (caso explícito del story file)', () => {
    const res = generateSeries({
      slots: [{ day_of_week: 1, time: '10:00', professional_id: PROF }],
      start_date: '2026-06-08', // lunes
      total_sessions: 1,
      isSlotAvailable: alwaysAvailable,
    })
    // 2026-06-09 es martes
    expect(res.placements[0].date).toBe('2026-06-09')
    expect(parseISO(res.placements[0].date).getDay()).toBe(2) // 2 = martes en JS
  })

  it('cuando start_date YA cae en el day_of_week del slot, la semana 0 usa start_date mismo', () => {
    // start_date 2026-06-09 = martes; slot day_of_week=1 (martes) → ocurrencia semana 0 = 2026-06-09
    const res = generateSeries({
      slots: [{ day_of_week: 1, time: '10:00', professional_id: PROF }],
      start_date: '2026-06-09',
      total_sessions: 1,
      isSlotAvailable: alwaysAvailable,
    })
    expect(res.placements[0].date).toBe('2026-06-09')
  })

  it('start_at/end_at provienen de isSlotAvailable (no se inventan en el helper)', () => {
    const isSlotAvailable = vi.fn(() => ({
      start_at: '2026-06-09T13:00:00Z',
      end_at: '2026-06-09T13:30:00Z',
    }))
    const res = generateSeries({
      slots: [{ day_of_week: 1, time: '10:00', professional_id: PROF }],
      start_date: '2026-06-08',
      total_sessions: 1,
      isSlotAvailable,
    })
    expect(res.placements[0].start_at).toBe('2026-06-09T13:00:00Z')
    expect(res.placements[0].end_at).toBe('2026-06-09T13:30:00Z')
  })
})
