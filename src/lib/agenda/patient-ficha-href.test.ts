import { describe, it, expect } from 'vitest'
import { patientFichaHref } from './patient-ficha-href'

describe('patientFichaHref', () => {
  describe('rol doctor', () => {
    it('devuelve la ruta con ?tab=notas', () => {
      expect(patientFichaHref('pat-abc', 'doctor')).toBe('/pacientes/pat-abc?tab=notas')
    })
  })

  describe('otros roles', () => {
    it('receptionist → ruta general sin tab', () => {
      expect(patientFichaHref('pat-abc', 'receptionist')).toBe('/pacientes/pat-abc')
    })

    it('admin → ruta general sin tab', () => {
      expect(patientFichaHref('pat-abc', 'admin')).toBe('/pacientes/pat-abc')
    })
  })

  describe('guard de patient_id nulo', () => {
    it('null patient_id → null (no link)', () => {
      expect(patientFichaHref(null, 'doctor')).toBeNull()
    })

    it('undefined patient_id → null (no link)', () => {
      expect(patientFichaHref(undefined, 'receptionist')).toBeNull()
    })

    it('string vacío → null (no link)', () => {
      // String vacío es falsy — se trata igual que null
      expect(patientFichaHref('', 'admin')).toBeNull()
    })
  })

  describe('rol aún cargando (null)', () => {
    it('null role con patient_id válido → ruta general (fallback seguro)', () => {
      // Durante la hidratación el rol puede ser null; en ese caso
      // se devuelve la ruta genérica en vez de null para no ocultar el link.
      expect(patientFichaHref('pat-abc', null)).toBe('/pacientes/pat-abc')
    })

    it('undefined role con patient_id válido → ruta general', () => {
      expect(patientFichaHref('pat-abc', undefined)).toBe('/pacientes/pat-abc')
    })
  })
})
