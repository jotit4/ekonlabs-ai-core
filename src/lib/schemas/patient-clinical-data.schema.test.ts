import { describe, it, expect } from 'vitest'
import {
  patientClinicalDataSchema,
  PATIENT_CLINICAL_DATA_KEYS,
} from './patient-clinical-data.schema'

describe('patientClinicalDataSchema (Story 14.4 — HCE; `cirugias` sumado en migración 047)', () => {
  describe('normalización de texto', () => {
    it('string vacío → null en los 4 campos', () => {
      const result = patientClinicalDataSchema.parse({
        antecedentes: '',
        alergias: '',
        medicacion: '',
        cirugias: '',
      })
      expect(result).toEqual({ antecedentes: null, alergias: null, medicacion: null, cirugias: null })
    })

    it('aplica trim al texto', () => {
      const result = patientClinicalDataSchema.parse({
        antecedentes: '  HTA y diabetes tipo 2  ',
        alergias: '\tPenicilina\n',
        medicacion: ' Enalapril 10mg ',
        cirugias: ' Apendicectomía 2018 ',
      })
      expect(result).toEqual({
        antecedentes: 'HTA y diabetes tipo 2',
        alergias: 'Penicilina',
        medicacion: 'Enalapril 10mg',
        cirugias: 'Apendicectomía 2018',
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
        cirugias: null,
      })
      expect(result).toEqual({ antecedentes: null, alergias: null, medicacion: null, cirugias: null })
    })

    it('rechaza valores no-string (número, objeto, array)', () => {
      expect(patientClinicalDataSchema.safeParse({ antecedentes: 42 }).success).toBe(false)
      expect(patientClinicalDataSchema.safeParse({ alergias: { a: 1 } }).success).toBe(false)
      expect(patientClinicalDataSchema.safeParse({ medicacion: ['x'] }).success).toBe(false)
      expect(patientClinicalDataSchema.safeParse({ cirugias: 42 }).success).toBe(false)
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

    it('parcial válido — solo cirugias', () => {
      const result = patientClinicalDataSchema.parse({ cirugias: 'Apendicectomía 2018' })
      expect(result.cirugias).toBe('Apendicectomía 2018')
    })

    it('el output normaliza las claves ausentes a null (por eso el PUT chequea el body crudo, no el output)', () => {
      // Documenta el comportamiento de Zod v4: el transform corre también para
      // claves ausentes → el output parseado NO distingue ausente de null.
      const result = patientClinicalDataSchema.parse({ alergias: 'Ibuprofeno' })
      expect(result).toEqual({
        antecedentes: null,
        alergias: 'Ibuprofeno',
        medicacion: null,
        cirugias: null,
      })
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
    it('expone exactamente las 4 claves clínicas (fuente del chequeo de presencia del PUT)', () => {
      expect(PATIENT_CLINICAL_DATA_KEYS).toEqual(['antecedentes', 'alergias', 'medicacion', 'cirugias'])
    })
  })
})
