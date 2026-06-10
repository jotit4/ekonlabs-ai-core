import { describe, it, expect } from 'vitest'
import { treatmentPlanInputSchema } from './treatment-plan.schema'

describe('treatmentPlanInputSchema', () => {
  describe('cie10_code', () => {
    it('acepta m54.5 y lo normaliza a MAYÚSCULAS (M54.5)', () => {
      const parsed = treatmentPlanInputSchema.parse({ cie10_code: 'm54.5' })
      expect(parsed.cie10_code).toBe('M54.5')
    })

    it('acepta código sin subcategoría (M54)', () => {
      const parsed = treatmentPlanInputSchema.parse({ cie10_code: 'M54' })
      expect(parsed.cie10_code).toBe('M54')
    })

    it('rechaza XX99 (dos letras iniciales)', () => {
      expect(treatmentPlanInputSchema.safeParse({ cie10_code: 'XX99' }).success).toBe(false)
    })

    it('rechaza 1A2 (no empieza con letra)', () => {
      expect(treatmentPlanInputSchema.safeParse({ cie10_code: '1A2' }).success).toBe(false)
    })

    it('rechaza M5 (menos de dos dígitos)', () => {
      expect(treatmentPlanInputSchema.safeParse({ cie10_code: 'M5' }).success).toBe(false)
    })

    it("'' → null (vacío no se valida como formato)", () => {
      const parsed = treatmentPlanInputSchema.parse({ cie10_code: '' })
      expect(parsed.cie10_code).toBeNull()
    })

    it('null y ausente → null', () => {
      expect(treatmentPlanInputSchema.parse({ cie10_code: null }).cie10_code).toBeNull()
      expect(treatmentPlanInputSchema.parse({}).cie10_code).toBeNull()
    })

    it('trim antes de validar (" m54.5 " → M54.5)', () => {
      const parsed = treatmentPlanInputSchema.parse({ cie10_code: ' m54.5 ' })
      expect(parsed.cie10_code).toBe('M54.5')
    })
  })

  describe('motivo_consulta / objetivo', () => {
    it('trim + string vacío → null', () => {
      const parsed = treatmentPlanInputSchema.parse({ motivo_consulta: '   ', objetivo: '' })
      expect(parsed.motivo_consulta).toBeNull()
      expect(parsed.objetivo).toBeNull()
    })

    it('conserva el texto trimmeado', () => {
      const parsed = treatmentPlanInputSchema.parse({
        motivo_consulta: '  Dolor lumbar  ',
        objetivo: 'Recuperar movilidad',
      })
      expect(parsed.motivo_consulta).toBe('Dolor lumbar')
      expect(parsed.objetivo).toBe('Recuperar movilidad')
    })

    it('ausentes → null (body vacío es válido)', () => {
      const parsed = treatmentPlanInputSchema.parse({})
      expect(parsed.motivo_consulta).toBeNull()
      expect(parsed.objetivo).toBeNull()
    })
  })

  describe('indicated_sessions', () => {
    it('acepta entero ≥ 1', () => {
      expect(treatmentPlanInputSchema.parse({ indicated_sessions: 10 }).indicated_sessions).toBe(10)
      expect(treatmentPlanInputSchema.parse({ indicated_sessions: 1 }).indicated_sessions).toBe(1)
    })

    it('rechaza 0', () => {
      expect(treatmentPlanInputSchema.safeParse({ indicated_sessions: 0 }).success).toBe(false)
    })

    it('rechaza negativos', () => {
      expect(treatmentPlanInputSchema.safeParse({ indicated_sessions: -3 }).success).toBe(false)
    })

    it('rechaza decimales', () => {
      expect(treatmentPlanInputSchema.safeParse({ indicated_sessions: 1.5 }).success).toBe(false)
    })

    it('rechaza strings numéricos (sin coerción)', () => {
      expect(treatmentPlanInputSchema.safeParse({ indicated_sessions: '5' }).success).toBe(false)
    })

    it('null y ausente → null (sin máximo)', () => {
      expect(treatmentPlanInputSchema.parse({ indicated_sessions: null }).indicated_sessions).toBeNull()
      expect(treatmentPlanInputSchema.parse({}).indicated_sessions).toBeNull()
      expect(treatmentPlanInputSchema.parse({ indicated_sessions: 9999 }).indicated_sessions).toBe(9999)
    })
  })

  describe('strictObject — claves desconocidas', () => {
    it('rechaza discharge_at (scope 14.6)', () => {
      expect(
        treatmentPlanInputSchema.safeParse({ discharge_at: '2026-06-10T00:00:00Z' }).success,
      ).toBe(false)
    })

    it('rechaza discharge_report (scope 14.6)', () => {
      expect(treatmentPlanInputSchema.safeParse({ discharge_report: 'alta' }).success).toBe(false)
    })

    it('rechaza tenant_id / patient_id / author_id (nunca del body)', () => {
      expect(treatmentPlanInputSchema.safeParse({ tenant_id: 't-1' }).success).toBe(false)
      expect(treatmentPlanInputSchema.safeParse({ patient_id: 'p-1' }).success).toBe(false)
      expect(treatmentPlanInputSchema.safeParse({ author_id: 'u-1' }).success).toBe(false)
    })

    it('rechaza cualquier clave arbitraria', () => {
      expect(treatmentPlanInputSchema.safeParse({ foo: 'bar' }).success).toBe(false)
    })
  })

  it('body completo válido → output normalizado', () => {
    const parsed = treatmentPlanInputSchema.parse({
      motivo_consulta: 'Lumbalgia crónica',
      objetivo: 'Reducir dolor',
      cie10_code: 'm54.5',
      indicated_sessions: 10,
    })
    expect(parsed).toEqual({
      motivo_consulta: 'Lumbalgia crónica',
      objetivo: 'Reducir dolor',
      cie10_code: 'M54.5',
      indicated_sessions: 10,
    })
  })
})
