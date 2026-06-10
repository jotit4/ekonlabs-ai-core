import { describe, it, expect } from 'vitest'
import { sessionNoteInputSchema } from './session-note.schema'

describe('sessionNoteInputSchema', () => {
  describe('worked_on / progress', () => {
    it("'' → null (string vacío no se persiste como '')", () => {
      const parsed = sessionNoteInputSchema.parse({ worked_on: '', progress: '' })
      expect(parsed.worked_on).toBeNull()
      expect(parsed.progress).toBeNull()
    })

    it('solo espacios → null', () => {
      const parsed = sessionNoteInputSchema.parse({ worked_on: '   ', progress: ' \t ' })
      expect(parsed.worked_on).toBeNull()
      expect(parsed.progress).toBeNull()
    })

    it('trim del texto (" texto " → "texto")', () => {
      const parsed = sessionNoteInputSchema.parse({
        worked_on: '  Movilidad de hombro  ',
        progress: '  Mejora el rango articular  ',
      })
      expect(parsed.worked_on).toBe('Movilidad de hombro')
      expect(parsed.progress).toBe('Mejora el rango articular')
    })

    it('ambos ausentes → { worked_on: null, progress: null } (body vacío válido)', () => {
      const parsed = sessionNoteInputSchema.parse({})
      expect(parsed).toEqual({ worked_on: null, progress: null })
    })

    it('null explícito → null', () => {
      const parsed = sessionNoteInputSchema.parse({ worked_on: null, progress: null })
      expect(parsed.worked_on).toBeNull()
      expect(parsed.progress).toBeNull()
    })

    it('ambos null es válido (success true)', () => {
      expect(sessionNoteInputSchema.safeParse({ worked_on: null, progress: null }).success).toBe(
        true,
      )
    })

    it('rechaza valores no-string (número)', () => {
      expect(sessionNoteInputSchema.safeParse({ worked_on: 42 }).success).toBe(false)
      expect(sessionNoteInputSchema.safeParse({ progress: 42 }).success).toBe(false)
    })
  })

  describe('strictObject — claves desconocidas (NUNCA del body)', () => {
    it('rechaza appointment_id (viene del path param)', () => {
      expect(sessionNoteInputSchema.safeParse({ appointment_id: 'apt-1' }).success).toBe(false)
    })

    it('rechaza treatment_id (se deriva de appointments.package_id)', () => {
      expect(sessionNoteInputSchema.safeParse({ treatment_id: 'trt-1' }).success).toBe(false)
    })

    it('rechaza tenant_id (viene del JWT)', () => {
      expect(sessionNoteInputSchema.safeParse({ tenant_id: 'tenant-1' }).success).toBe(false)
    })

    it('rechaza patient_id (se deriva de la fila appointments)', () => {
      expect(sessionNoteInputSchema.safeParse({ patient_id: 'pat-1' }).success).toBe(false)
    })

    it('rechaza author_id (es user.id de la sesión)', () => {
      expect(sessionNoteInputSchema.safeParse({ author_id: 'user-1' }).success).toBe(false)
    })

    it('rechaza discharge_report (scope 14.6)', () => {
      expect(sessionNoteInputSchema.safeParse({ discharge_report: 'alta' }).success).toBe(false)
    })

    it('rechaza cualquier clave arbitraria', () => {
      expect(sessionNoteInputSchema.safeParse({ foo: 'bar' }).success).toBe(false)
    })
  })

  it('body completo válido → output normalizado', () => {
    const parsed = sessionNoteInputSchema.parse({
      worked_on: 'Ejercicios de fortalecimiento',
      progress: 'Tolera carga progresiva',
    })
    expect(parsed).toEqual({
      worked_on: 'Ejercicios de fortalecimiento',
      progress: 'Tolera carga progresiva',
    })
  })
})
