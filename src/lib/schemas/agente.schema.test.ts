import { describe, it, expect } from 'vitest'
import { ClinicConfigPatchSchema, MAX_BOOKING_WINDOWS } from './agente.schema'

// ── booking_windows (pedido ISADI 2026-07-14) ─────────────────────────────────
//
// Franjas horarias en las que el agente de WhatsApp puede ofrecer/agendar
// turnos. Ausente/null/vacío = sin restricción (default). Formato "HH:MM" 24h,
// start < end, sin solapes entre franjas, máximo MAX_BOOKING_WINDOWS.

function parse(bookingWindows: unknown) {
  return ClinicConfigPatchSchema.safeParse({
    operations_config: { booking_windows: bookingWindows },
  })
}

describe('ClinicConfigPatchSchema — operations_config.booking_windows', () => {
  // ── Default: ausente/null/vacío = sin restricción ───────────────────────────

  it('acepta operations_config sin booking_windows (ausente)', () => {
    const result = ClinicConfigPatchSchema.safeParse({
      operations_config: { min_notice_hours: 2 },
    })
    expect(result.success).toBe(true)
  })

  it('acepta booking_windows = null', () => {
    expect(parse(null).success).toBe(true)
  })

  it('acepta booking_windows = [] (array vacío)', () => {
    expect(parse([]).success).toBe(true)
  })

  it('acepta operations_config = undefined (no se edita nada)', () => {
    const result = ClinicConfigPatchSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  // ── Casos válidos ────────────────────────────────────────────────────────────

  it('acepta una franja válida', () => {
    const result = parse([{ start: '08:00', end: '12:00' }])
    expect(result.success).toBe(true)
  })

  it('acepta el caso del pedido: 08:00-12:00 y 15:00-18:00', () => {
    const result = parse([
      { start: '08:00', end: '12:00' },
      { start: '15:00', end: '18:00' },
    ])
    expect(result.success).toBe(true)
  })

  it('acepta franjas contiguas (fin de una = inicio de la siguiente, no es solape)', () => {
    const result = parse([
      { start: '08:00', end: '12:00' },
      { start: '12:00', end: '15:00' },
    ])
    expect(result.success).toBe(true)
  })

  it(`acepta exactamente ${MAX_BOOKING_WINDOWS} franjas`, () => {
    const windows = Array.from({ length: MAX_BOOKING_WINDOWS }, (_, i) => ({
      start: `0${i}:00`,
      end: `0${i}:30`,
    }))
    expect(parse(windows).success).toBe(true)
  })

  // ── Formato HH:MM ────────────────────────────────────────────────────────────

  it('rechaza una hora sin cero a la izquierda ("8:00")', () => {
    const result = parse([{ start: '8:00', end: '12:00' }])
    expect(result.success).toBe(false)
  })

  it('rechaza una hora con formato am/pm', () => {
    const result = parse([{ start: '08:00 AM', end: '12:00 PM' }])
    expect(result.success).toBe(false)
  })

  it('rechaza hora inválida (25:00)', () => {
    const result = parse([{ start: '25:00', end: '12:00' }])
    expect(result.success).toBe(false)
  })

  it('rechaza minutos inválidos (08:75)', () => {
    const result = parse([{ start: '08:75', end: '12:00' }])
    expect(result.success).toBe(false)
  })

  it('el mensaje de error de formato es humano (no jerga técnica)', () => {
    const result = parse([{ start: '8:00', end: '12:00' }])
    expect(result.success).toBe(false)
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message)
      expect(messages.some((m) => /formato HH:MM/i.test(m))).toBe(true)
    }
  })

  // ── start < end ──────────────────────────────────────────────────────────────

  it('rechaza una franja donde start === end', () => {
    const result = parse([{ start: '10:00', end: '10:00' }])
    expect(result.success).toBe(false)
  })

  it('rechaza una franja donde start > end', () => {
    const result = parse([{ start: '12:00', end: '08:00' }])
    expect(result.success).toBe(false)
  })

  // ── Solapes ──────────────────────────────────────────────────────────────────

  it('rechaza dos franjas que se solapan parcialmente', () => {
    const result = parse([
      { start: '08:00', end: '12:00' },
      { start: '11:00', end: '18:00' },
    ])
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some((i) => /no pueden superponerse/i.test(i.message)),
      ).toBe(true)
    }
  })

  it('rechaza una franja totalmente contenida dentro de otra', () => {
    const result = parse([
      { start: '08:00', end: '18:00' },
      { start: '10:00', end: '12:00' },
    ])
    expect(result.success).toBe(false)
  })

  it('rechaza tres franjas donde sólo dos se solapan', () => {
    const result = parse([
      { start: '08:00', end: '10:00' },
      { start: '09:00', end: '11:00' },
      { start: '15:00', end: '18:00' },
    ])
    expect(result.success).toBe(false)
  })

  // ── Máximo de franjas ──────────────────────────────────────────────────────

  it(`rechaza más de ${MAX_BOOKING_WINDOWS} franjas`, () => {
    const windows = Array.from({ length: MAX_BOOKING_WINDOWS + 1 }, (_, i) => ({
      start: `0${i}:00`,
      end: `0${i}:30`,
    }))
    const result = parse(windows)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some((i) => /no se pueden cargar más de/i.test(i.message)),
      ).toBe(true)
    }
  })

  // ── El turno debe caber ENTERO en la franja: esto lo aplica el AGENTE, no el
  //    dashboard — el schema sólo valida la forma de la franja en sí.
})
