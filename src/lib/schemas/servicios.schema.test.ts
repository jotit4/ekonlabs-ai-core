import { describe, it, expect } from 'vitest'
import { CreateServiceSchema, UpdateServiceSchema } from './servicios.schema'

// ── Story 12.5: reminder_hours_before + reminder_instructions ──────────────────

describe('CreateServiceSchema — campos de recordatorio (Story 12.5)', () => {
  const base = { name: 'Kinesiología', calendar_id: 'kin@cal.com' }

  it('acepta reminder_hours_before válido (24) e instrucciones', () => {
    const r = CreateServiceSchema.safeParse({
      ...base,
      reminder_hours_before: 24,
      reminder_instructions: 'Traer estudios previos',
    })
    expect(r.success).toBe(true)
  })

  it('acepta null en ambos campos (sin recordatorio)', () => {
    const r = CreateServiceSchema.safeParse({
      ...base,
      reminder_hours_before: null,
      reminder_instructions: null,
    })
    expect(r.success).toBe(true)
  })

  it('acepta omitir ambos campos (undefined)', () => {
    const r = CreateServiceSchema.safeParse({ ...base })
    expect(r.success).toBe(true)
  })

  it('acepta instrucciones de exactamente 500 caracteres', () => {
    const r = CreateServiceSchema.safeParse({
      ...base,
      reminder_instructions: 'x'.repeat(500),
    })
    expect(r.success).toBe(true)
  })

  it('rechaza reminder_hours_before = 0', () => {
    const r = CreateServiceSchema.safeParse({ ...base, reminder_hours_before: 0 })
    expect(r.success).toBe(false)
  })

  it('rechaza reminder_hours_before negativo (-1)', () => {
    const r = CreateServiceSchema.safeParse({ ...base, reminder_hours_before: -1 })
    expect(r.success).toBe(false)
  })

  it('rechaza reminder_hours_before no entero (3.5)', () => {
    const r = CreateServiceSchema.safeParse({ ...base, reminder_hours_before: 3.5 })
    expect(r.success).toBe(false)
  })

  it('rechaza reminder_hours_before > 720 (721)', () => {
    const r = CreateServiceSchema.safeParse({ ...base, reminder_hours_before: 721 })
    expect(r.success).toBe(false)
  })

  it('rechaza instrucciones de 501 caracteres', () => {
    const r = CreateServiceSchema.safeParse({
      ...base,
      reminder_instructions: 'x'.repeat(501),
    })
    expect(r.success).toBe(false)
  })
})

describe('UpdateServiceSchema — campos de recordatorio (Story 12.5)', () => {
  it('acepta valores válidos', () => {
    const r = UpdateServiceSchema.safeParse({
      reminder_hours_before: 48,
      reminder_instructions: 'Ayuno de 8 horas',
    })
    expect(r.success).toBe(true)
  })

  it('acepta null explícito (limpiar campo — AC3)', () => {
    const r = UpdateServiceSchema.safeParse({
      reminder_hours_before: null,
      reminder_instructions: null,
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.reminder_hours_before).toBeNull()
      expect(r.data.reminder_instructions).toBeNull()
    }
  })

  it('rechaza 721 horas', () => {
    const r = UpdateServiceSchema.safeParse({ reminder_hours_before: 721 })
    expect(r.success).toBe(false)
  })

  it('rechaza instrucciones de 501 caracteres', () => {
    const r = UpdateServiceSchema.safeParse({ reminder_instructions: 'x'.repeat(501) })
    expect(r.success).toBe(false)
  })
})
