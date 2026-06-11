import { describe, it, expect } from 'vitest'
import {
  patientClinicalDataSchema,
  PATIENT_CLINICAL_DATA_KEYS,
} from './patient-clinical-data.schema'

describe('patientClinicalDataSchema (Story 14.4 — HCE)', () => {
  describe('normalización de texto', () => {
    it('string vacío → null en los 3 campos', () => {
      const result = patientClinicalDataSchema.parse({
        antecedentes: '',
        alergias: '',
        medicacion: '',
      })
      expect(result).toEqual({ antecedentes: null, alergias: null, medicacion: null })
    })

    it('aplica trim al texto', () => {
      const result = patientClinicalDataSchema.parse({
        antecedentes: '  HTA y diabetes tipo 2  ',
        alergias: '\tPenicilina\n',
        medicacion: ' Enalapril 10mg ',
      })
      expect(result).toEqual({
        antecedentes: 'HTA y diabetes tipo 2',
        alergias: 'Penicilina',
        medicacion: 'Enalapril 10mg',
      })
    })

    it('string de solo espacios → null', () => {
      const result = patientClinicalDataSchema.parse({ alergias: '   ' })
      expect(result.alergias).toBeNull()
    })

    it('null explícito es válido → null', () => {
      const result = patientClinicalDataSchema.parse({
        antecedentes: null,
        alergias: null,
        medicacion: null,
      })
      expect(result).toEqual({ antecedentes: null, alergias: null, medicacion: null })
    })

    it('rechaza valores no-string (número, objeto, array)', () => {
      expect(patientClinicalDataSchema.safeParse({ antecedentes: 42 }).success).toBe(false)
      expect(patientClinicalDataSchema.safeParse({ alergias: { a: 1 } }).success).toBe(false)
      expect(patientClinicalDataSchema.safeParse({ medicacion: ['x'] }).success).toBe(false)
    })
  })

  describe('actualización parcial', () => {
    it('objeto vacío {} es válido (el PUT decide qué tocar por presencia en el body crudo)', () => {
      const result = patientClinicalDataSchema.safeParse({})
      expect(result.success).toBe(true)
    })

    it('parcial válido — solo alergias', () => {
      const result = patientClinicalDataSchema.parse({ alergias: 'Ibuprofeno' })
      expect(result.alergias).toBe('Ibuprofeno')
    })

    it('el output normaliza las claves ausentes a null (por eso el PUT chequea el body crudo, no el output)', () => {
      // Documenta el comportamiento de Zod v4: el transform corre también para
      // claves ausentes → el output parseado NO distingue ausente de null.
      const result = patientClinicalDataSchema.parse({ alergias: 'Ibuprofeno' })
      expect(result).toEqual({ antecedentes: null, alergias: 'Ibuprofeno', medicacion: null })
    })
  })

  describe('strictObject — claves desconocidas rechazadas', () => {
    it.each(['patient_id', 'tenant_id', 'notes', 'full_name', 'clinical_notes', 'dni'])(
      'rechaza la clave extra %s',
      (key) => {
        const result = patientClinicalDataSchema.safeParse({
          alergias: 'Polen',
          [key]: 'evil-value',
        })
        expect(result.success).toBe(false)
      },
    )

    it('rechaza cualquier clave arbitraria', () => {
      const result = patientClinicalDataSchema.safeParse({ foo: 'bar' })
      expect(result.success).toBe(false)
    })
  })

  describe('PATIENT_CLINICAL_DATA_KEYS', () => {
    it('expone exactamente las 3 claves clínicas (fuente del chequeo de presencia del PUT)', () => {
      expect(PATIENT_CLINICAL_DATA_KEYS).toEqual(['antecedentes', 'alergias', 'medicacion'])
    })
  })
})
